from fastapi import APIRouter, Depends, HTTPException
from fastapi.encoders import jsonable_encoder
from sqlalchemy import select, func
from datetime import datetime, timedelta
import re
from sqlalchemy.ext.asyncio import AsyncSession
from app.api.auth import require_manager
from app.db.session import get_session
from app.db.models import *
from app.schemas import *
from app.discovery.service import DiscoveryService, DiscoveryProviderError
from app.research.service import ResearchService
from app.policy.engine import PolicyEngine
from app.fitment.engine import ICPFitmentEngine
from app.matching.engine import RepMatchEngine
from app.core.config import settings
from app.dronahq.registry import agent_registry, run_agent, public_agent_status
from app.hurdles.service import ensure_hurdles
from app.delivery.service import CHANNEL_RECIPIENT_FIELD
from app.rag.retriever import SimpleRetriever

router=APIRouter(prefix='/api/manager',tags=['manager'])
def out(x): return {a.key:getattr(x,a.key) for a in __import__('sqlalchemy').inspect(x).mapper.column_attrs}
async def campaign(id,db):
    x=await db.get(Campaign,id)
    if not x: raise HTTPException(404,'Campaign not found')
    return x
async def draft(id,db):
    x=await campaign(id,db)
    if x.status!='DRAFT': raise HTTPException(409,'Campaign configuration is only allowed while DRAFT')
    return x
def audit(db,action,entity,id,details=None): db.add(AuditLog(action=action,entity_type=entity,entity_id=id,details=details or {}))
async def setup_for(c,db):
    x=await db.scalar(select(CampaignSetup).where(CampaignSetup.campaign_id==c.id))
    if not x: x=CampaignSetup(campaign_id=c.id); db.add(x); await db.flush()
    return x
async def fit(db,c,p):
    reasons=[]; score=0
    if not c.target_roles or any(x.lower() in p.title.lower() for x in c.target_roles): score+=40; reasons.append('Target title matches')
    if not c.target_industries or any(x.lower() in p.industry.lower() for x in c.target_industries): score+=35; reasons.append('Industry matches')
    if not c.company_size or (c.company_size.get('min',0)<=p.employee_count<=c.company_size.get('max',10**9)): score+=25; reasons.append('Company size matches')
    suppressed=bool(await db.scalar(select(SuppressionEntry).where(SuppressionEntry.prospect_id==p.id,SuppressionEntry.active==True)))
    conflicts=[]
    for cp,other in (await db.execute(select(CampaignProspect,Campaign).join(Campaign).where(CampaignProspect.prospect_id==p.id,CampaignProspect.campaign_id!=c.id,Campaign.status.in_(['LIVE','PAUSED'])))).all(): conflicts.append({'campaign_id':other.id,'campaign_name':other.name,'status':other.status,'last_contacted_at':cp.last_contacted_at,'blocking':other.status=='LIVE' and cp.last_contacted_at is not None})
    return {'prospect_id':p.id,'fit_score':score,'fit_reasons':reasons,'company':p.website or p.industry,'role':p.title,'research_status':p.lifecycle_status,'conflicts':conflicts,'suppressed':suppressed}
@router.get('/dashboard')
async def dashboard(db:AsyncSession=Depends(get_session),identity=Depends(require_manager)):
    campaigns=(await db.scalars(select(Campaign))).all(); cards=[]
    for c in campaigns:
        cards.append({'id':c.id,'name':c.name,'icp_summary':f"{', '.join(c.target_roles)} / {', '.join(c.target_industries)}",'status':c.status,'prospect_count':await db.scalar(select(func.count()).select_from(CampaignProspect).where(CampaignProspect.campaign_id==c.id)) or 0,'outreach_sent':await db.scalar(select(func.count()).select_from(OutreachEvent).where(OutreachEvent.campaign_id==c.id,OutreachEvent.status=='SENT')) or 0,'meetings_booked':await db.scalar(select(func.count()).select_from(Conversation).where(Conversation.campaign_id==c.id,Conversation.status=='MEETING_INTENT')) or 0,'open_conversations':await db.scalar(select(func.count()).select_from(Conversation).where(Conversation.campaign_id==c.id,Conversation.status=='OPEN')) or 0,'created_at':c.created_at,'updated_at':c.updated_at})
    threshold=datetime.utcnow()-timedelta(hours=settings().approval_aging_threshold_hours)
    aging_count=await db.scalar(select(func.count()).select_from(ApprovalRequest).where(ApprovalRequest.status=='PENDING', ApprovalRequest.created_at < threshold)) or 0
    return {'pending_approvals':await db.scalar(select(func.count()).select_from(ApprovalRequest).where(ApprovalRequest.status=='PENDING')) or 0,'replies_needing_attention':await db.scalar(select(func.count()).select_from(Conversation).where(Conversation.status=='OPEN')) or 0,'meetings_booked_today':sum(x['meetings_booked'] for x in cards),'active_alerts':aging_count,'campaigns':cards}
@router.get('/campaigns')
async def campaigns(db:AsyncSession=Depends(get_session),identity=Depends(require_manager)): return (await dashboard(db,identity))['campaigns']
@router.get('/alerts')
async def alerts(db:AsyncSession=Depends(get_session),identity=Depends(require_manager)):
    await ensure_hurdles(db)
    threshold=datetime.utcnow()-timedelta(hours=settings().approval_aging_threshold_hours)
    aging=(await db.execute(select(ApprovalRequest,User).join(User,ApprovalRequest.representative_id==User.id).where(ApprovalRequest.status=='PENDING',ApprovalRequest.created_at < threshold))).all()
    res=[]
    for a,u in aging:
        age_h=max(1,int((datetime.utcnow()-a.created_at).total_seconds()/3600))
        res.append({'id':a.id,'type':'AGING_APPROVAL','severity':'HIGH','message':f'1 approval draft review • {age_h}h - {u.name} • Immediate attention required','created_at':a.created_at,'representative_id':u.id,'representative_name':u.name})
    # Representative-escalated AI hurdles surface here too, so managers never need a second escalation system.
    escalated=(await db.execute(select(Hurdle,User).outerjoin(User,Hurdle.representative_id==User.id).where(Hurdle.escalated_to_manager==True,Hurdle.status!='RESOLVED'))).all()
    for h,u in escalated:
        res.append({'id':h.id,'type':'HURDLE_ESCALATED','severity':'HIGH' if h.status=='ESCALATED' else 'MEDIUM','message':f'AI hurdle escalated • {h.category.replace("_"," ").title()} - {u.name if u else "Unassigned"} • {h.reason}','created_at':h.escalated_at or h.created_at})
    # Reps over capacity: same 90% threshold the roster/monitoring screens use.
    rep_rows=(await db.execute(select(User,AccessProfile).join(AccessProfile).where(AccessProfile.role=='REPRESENTATIVE',AccessProfile.active==True))).all()
    capacity_threshold=settings().capacity_alert_threshold_pct/100
    for user,profile in rep_rows:
        active=await db.scalar(select(func.count()).select_from(LeadAssignment).where(LeadAssignment.representative_id==user.id,LeadAssignment.status=='ASSIGNED')) or 0
        if profile.max_active_leads>0 and active/profile.max_active_leads>=capacity_threshold:
            pct=round(active/profile.max_active_leads*100)
            res.append({'id':f'capacity-{user.id}','type':'REP_OVER_CAPACITY','severity':'HIGH' if pct>=100 else 'MEDIUM','message':f'{user.name} is at {pct}% capacity ({active}/{profile.max_active_leads} leads) • Reassign or raise their limit','created_at':datetime.utcnow(),'representative_id':user.id,'representative_name':user.name})
    # Suppression/DNC blocks: the PolicyEngine already refused these sends; surface them as a platform-wide alert.
    suppressed=(await db.execute(select(Hurdle,Prospect).outerjoin(Prospect,Hurdle.prospect_id==Prospect.id).where(Hurdle.category=='SUPPRESSION_DNC',Hurdle.status!='RESOLVED'))).all()
    for h,p in suppressed:
        who=f'{p.first_name} {p.last_name}'.strip() if p else 'a prospect'
        res.append({'id':f'suppression-{h.id}','type':'SUPPRESSION_BLOCKED','severity':'MEDIUM','message':f'Outreach to {who} was blocked by the suppression/DNC list • {h.reason}','created_at':h.created_at})
    return res
@router.post('/campaigns')
async def create(data:ManagerCampaignCreate,db:AsyncSession=Depends(get_session),identity=Depends(require_manager)):
    c=Campaign(name=data.name,description=data.description,status='DRAFT',demo_mode=True); db.add(c); await db.flush(); db.add(CampaignSetup(campaign_id=c.id,owner_id=identity[0].id))
    for agent_type in ['DISCOVERY','ICP_FITMENT','RESEARCH','OUTREACH_STRATEGY','PERSONALIZATION','CONVERSATION','FOLLOW_UP','VOICE']: db.add(CampaignAgent(campaign_id=c.id,agent_type=agent_type,enabled=False))
    audit(db,'CAMPAIGN_CREATED','campaign',c.id); await db.commit(); return out(c)
@router.get('/campaigns/{id}/identity')
async def get_identity(id:str,db:AsyncSession=Depends(get_session),identity=Depends(require_manager)):
    c=await campaign(id,db); s=await setup_for(c,db); return {'id':c.id,'name':c.name,'description':c.description,'status':c.status,'owner_id':s.owner_id}
@router.get('/campaigns/{id}/demo-mode')
async def get_demo_mode(id:str,db:AsyncSession=Depends(get_session),identity=Depends(require_manager)):
    c=await campaign(id,db); return {'demo_mode':c.demo_mode,'demo_recipient_email':c.demo_recipient_email}
@router.patch('/campaigns/{id}/demo-mode')
async def save_demo_mode(id:str,data:DemoModeIn,db:AsyncSession=Depends(get_session),identity=Depends(require_manager)):
    c=await campaign(id,db)
    recipient=(data.demo_recipient_email or '').strip().lower() or None
    if data.demo_mode and (not recipient or not re.fullmatch(r'[^@\s]+@[^@\s]+\.[^@\s]+', recipient)):
        raise HTTPException(422,'Demo mode requires a valid demo_recipient_email')
    c.demo_mode=data.demo_mode; c.demo_recipient_email=recipient
    audit(db,'CAMPAIGN_DEMO_MODE_UPDATED','campaign',id,{'actor':identity[0].id,'demo_mode':c.demo_mode,'demo_recipient_configured':bool(recipient)})
    await db.commit(); return {'demo_mode':c.demo_mode,'demo_recipient_email':c.demo_recipient_email}
@router.post('/agents/{agent}/connection-test')
async def agent_connection_test(agent:str,db:AsyncSession=Depends(get_session),identity=Depends(require_manager)):
    """Safe, manager-only connectivity check; it never creates campaign data."""
    if agent not in agent_registry(): raise HTTPException(404,'Unknown DronaHQ agent')
    started=datetime.utcnow()
    try:
        response=await run_agent(agent,{'test':True,'purpose':'connectivity_check','do_not_send_outreach':True})
    except DiscoveryProviderError as exc:
        status=503 if exc.code != 'AGENT_NOT_CONFIGURED' else 409
        raise HTTPException(status,detail={'code':exc.code,'message':exc.message}) from exc
    return {'agent':agent,'status':'CONNECTED','response':'VALID' if isinstance(response,dict) else 'INVALID','latency_ms':int((datetime.utcnow()-started).total_seconds()*1000)}
@router.patch('/campaigns/{id}/identity')
async def identity_config(id:str,data:IdentityIn,db:AsyncSession=Depends(get_session),identity=Depends(require_manager)):
    c=await draft(id,db)
    if not data.name.strip() or not await db.get(User,data.owner_id): raise HTTPException(422,'name and valid owner_id are required')
    c.name=data.name; c.description=data.description; (await setup_for(c,db)).owner_id=data.owner_id; audit(db,'CAMPAIGN_UPDATED','campaign',id); await db.commit(); return out(c)
@router.patch('/campaigns/{id}/icp')
async def save_icp(id:str,data:IcpIn,db:AsyncSession=Depends(get_session),identity=Depends(require_manager)):
    c=await draft(id,db); c.target_geography=data.geography; c.target_roles=data.target_roles; c.target_industries=data.industries; c.company_size=data.company_size; s=await setup_for(c,db)
    for key in ['revenue_range','funding_stage','technologies','exclusion_criteria','reference_profiles','custom_criteria']: setattr(s,key,getattr(data,key))
    audit(db,'ICP_UPDATED','campaign',id); await db.commit(); return await get_icp(id,db,identity)
@router.get('/campaigns/{id}/icp')
async def get_icp(id:str,db:AsyncSession=Depends(get_session),identity=Depends(require_manager)):
    c=await campaign(id,db); s=await setup_for(c,db); return {'geography':c.target_geography,'target_roles':c.target_roles,'industries':c.target_industries,'company_size':c.company_size,'revenue_range':s.revenue_range,'funding_stage':s.funding_stage,'technologies':s.technologies,'exclusion_criteria':s.exclusion_criteria,'reference_profiles':s.reference_profiles,'custom_criteria':s.custom_criteria}
@router.get('/campaigns/{id}/agents')
async def agents(id:str,db:AsyncSession=Depends(get_session),identity=Depends(require_manager)):
    await campaign(id,db); rows=(await db.scalars(select(CampaignAgent).where(CampaignAgent.campaign_id==id))).all(); return [{'agent':out(a),'configuration':out(await db.scalar(select(CampaignAgentConfig).where(CampaignAgentConfig.campaign_agent_id==a.id))) if await db.scalar(select(CampaignAgentConfig).where(CampaignAgentConfig.campaign_agent_id==a.id)) else None} for a in rows]
@router.patch('/campaigns/{id}/agents/{agent_id}')
async def configure_agent(id:str,agent_id:str,data:AgentConfigIn,db:AsyncSession=Depends(get_session),identity=Depends(require_manager)):
    await draft(id,db); a=await db.get(CampaignAgent,agent_id)
    if not a or a.campaign_id!=id: raise HTTPException(404,'Campaign agent not found')
    a.enabled=data.enabled; cfg=await db.scalar(select(CampaignAgentConfig).where(CampaignAgentConfig.campaign_agent_id==a.id))
    if not cfg: cfg=CampaignAgentConfig(campaign_agent_id=a.id); db.add(cfg)
    cfg.responsibilities=data.responsibilities; cfg.decision_thresholds=data.decision_thresholds; cfg.escalation_rules=data.escalation_rules; cfg.prompt_version_id=data.prompt_version_id; audit(db,'AGENT_ENABLED' if data.enabled else 'AGENT_DISABLED','campaign_agent',a.id); await db.commit(); return out(a)
@router.post('/campaigns/{id}/agents/{agent_id}/{action}')
async def agent_pause(id:str,agent_id:str,action:str,db:AsyncSession=Depends(get_session),identity=Depends(require_manager)):
    if action not in ['pause','resume']: raise HTTPException(404,'Unknown action')
    a=await db.get(CampaignAgent,agent_id)
    if not a or a.campaign_id!=id: raise HTTPException(404,'Campaign agent not found')
    previous='ENABLED' if a.enabled else 'PAUSED'; a.enabled=action=='resume'; audit(db,'AGENT_RESUMED' if a.enabled else 'AGENT_PAUSED','campaign_agent',a.id,{'actor':identity[0].id,'role':'MANAGER','campaign_id':id,'previous_state':previous,'new_state':'ENABLED' if a.enabled else 'PAUSED'}); await db.commit(); return {**out(a),'status':'ENABLED' if a.enabled else 'PAUSED'}
@router.post('/campaigns/{id}/channels/{channel}/{action}')
async def channel_pause(id:str,channel:str,action:str,db:AsyncSession=Depends(get_session),identity=Depends(require_manager)):
    if action not in ['pause','resume'] or channel.lower() not in ['email','linkedin','message','voice']: raise HTTPException(404,'Unknown channel action')
    await campaign(id,db); channel=channel.lower()
    row=await db.scalar(select(CampaignChannelSettings).where(CampaignChannelSettings.campaign_id==id,CampaignChannelSettings.channel==channel))
    if not row: row=CampaignChannelSettings(campaign_id=id,channel=channel,enabled=True); db.add(row)
    previous='ENABLED' if row.enabled else 'PAUSED'; row.enabled=action=='resume'
    audit(db,'CHANNEL_RESUMED' if row.enabled else 'CHANNEL_PAUSED','campaign_channel',row.id,{'actor':identity[0].id,'role':'MANAGER','campaign_id':id,'channel':channel,'previous_state':previous,'new_state':'ENABLED' if row.enabled else 'PAUSED'})
    await db.commit(); return {**out(row),'status':'ENABLED' if row.enabled else 'PAUSED'}
@router.get('/approvals/summary')
async def approval_summary(db:AsyncSession=Depends(get_session),identity=Depends(require_manager)):
    threshold=datetime.utcnow()-timedelta(hours=settings().approval_aging_threshold_hours)
    rows=(await db.execute(select(ApprovalRequest,User).join(User,ApprovalRequest.representative_id==User.id).where(ApprovalRequest.status=='PENDING'))).all()
    grouped={}
    for approval,user in rows:
        item=grouped.setdefault(user.id,{'representative_id':user.id,'representative':user.name,'pending':0,'aging':0,'campaign_ids':[]})
        item['pending']+=1; item['aging']+=approval.created_at < threshold
        if approval.campaign_id not in item['campaign_ids']: item['campaign_ids'].append(approval.campaign_id)
    oldest=min((x.created_at for x,_ in rows),default=None)
    return {'total_pending':len(rows),'aging_count':sum(x.created_at < threshold for x,_ in rows),'oldest_age_hours':int((datetime.utcnow()-oldest).total_seconds()/3600) if oldest else 0,'aging_threshold_hours':settings().approval_aging_threshold_hours,'by_representative':list(grouped.values())}
@router.get('/approvals/aging')
async def aging_approvals(db:AsyncSession=Depends(get_session),identity=Depends(require_manager)):
    threshold=datetime.utcnow()-timedelta(hours=settings().approval_aging_threshold_hours)
    rows=(await db.execute(select(ApprovalRequest,User,Campaign,CampaignProspect,Prospect).join(User,ApprovalRequest.representative_id==User.id).join(Campaign,ApprovalRequest.campaign_id==Campaign.id).outerjoin(CampaignProspect,ApprovalRequest.campaign_prospect_id==CampaignProspect.id).outerjoin(Prospect,CampaignProspect.prospect_id==Prospect.id).where(ApprovalRequest.status=='PENDING',ApprovalRequest.created_at < threshold))).all()
    return [{'approval_id':a.id,'representative':{'id':u.id,'name':u.name},'campaign':{'id':c.id,'name':c.name},'prospect':out(p) if p else None,'age_hours':int((datetime.utcnow()-a.created_at).total_seconds()/3600),'channel':a.payload.get('channel','email'),'message_preview':a.payload.get('message',a.payload.get('summary',''))[:200],'created_at':a.created_at,'status':'AGING'} for a,u,c,cp,p in rows]
@router.post('/campaigns/{id}/prospects/discover')
async def discover(id:str,data:DiscoveryRequestIn=DiscoveryRequestIn(),db:AsyncSession=Depends(get_session),identity=Depends(require_manager)):
    c=await draft(id,db); icp={'geography':c.target_geography,'target_roles':c.target_roles,'industries':c.target_industries,'company_size':c.company_size}
    run=AgentRun(campaign_id=id,agent_type='DISCOVERY',status='RUNNING',input_data={'requested_count':data.requested_count,'icp':icp,'tool':'DISCOVERY_PROVIDER'}); db.add(run); await db.flush()
    try:
        result=await DiscoveryService().discover_for_campaign(id,icp,data.requested_count)
    except DiscoveryProviderError as exc:
        run.status='FAILED'; run.output_data={'error_code':exc.code,'error':exc.message,'diagnostic':exc.diagnostic,'tool':'DISCOVERY_PROVIDER'}; await db.commit(); raise HTTPException(503,detail={'code':exc.code,'message':exc.message,'diagnostic':exc.diagnostic,'run_id':run.id})
    found=[]; preview=[]
    for candidate in result.candidates:
        # Pydantic has already enforced score range/source enum; identity is still a backend decision.
        if not candidate.source_id or not (candidate.first_name or candidate.person_name) or not candidate.title:
            preview.append({'source_id':candidate.source_id,'valid':False,'reason':'Missing required candidate identity fields'}); continue
        p=await db.scalar(select(Prospect).where(Prospect.email==candidate.email)) if candidate.email else None
        duplicate=bool(p)
        if not p:
            first=candidate.first_name or candidate.person_name.split()[0]; last=candidate.last_name or ' '.join((candidate.person_name or '').split()[1:])
            p=Prospect(first_name=first,last_name=last,email=candidate.email or f'{candidate.source_id}@{candidate.source.lower()}.invalid',title=candidate.title,linkedin_url=candidate.linkedin_url or '',industry=candidate.industry or '',employee_count=candidate.company_size or 0,website=candidate.company_domain or '',metadata_={'discovery_source':candidate.source,'source_id':candidate.source_id,'source_url':candidate.linkedin_url or '','company_name':candidate.company_name or ''}); db.add(p); await db.flush()
        assessment=await fit(db,c,p); conflict=any(x['blocking'] for x in assessment['conflicts'])
        row={'prospect_id':p.id,'name':candidate.person_name or f'{p.first_name} {p.last_name}'.strip(),'title':candidate.title,'company':candidate.company_name,'fit_score':candidate.fit_score,'fit_reasons':candidate.fit_reasons,'matched_criteria':candidate.matched_criteria,'unmatched_criteria':candidate.unmatched_criteria,'confidence':candidate.confidence,'source':candidate.source,'source_id':candidate.source_id,'duplicate':duplicate,'conflict':conflict,'conflicts':assessment['conflicts'],'suppressed':assessment['suppressed']}
        preview.append(row)
        if not assessment['suppressed'] and not conflict: found.append(p.id)
    provider=result.candidates[0].source if result.candidates else 'DEMO'
    batch=ProspectBatch(campaign_id=id,mode=f'{provider}_DISCOVER',prospect_ids=found,created_by_id=identity[0].id); db.add(batch)
    run.status='COMPLETED'; run.output_data={'tool':provider,'dronahq_execution_id':result.execution_id,'candidate_count':len(result.candidates),'valid_preview_count':len(found),'search_summary':result.search_summary,'batch_id':batch.id}
    audit(db,'PROSPECT_BATCH_DISCOVERED','campaign',id,{'batch_id':batch.id,'run_id':run.id,'tool':provider,'candidate_count':len(result.candidates)}); await db.commit()
    return {'run_id':run.id,'batch_id':batch.id,'status':'COMPLETED','dronahq_execution_id':result.execution_id,'total_found':result.total_found,'search_summary':result.search_summary,'prospects':preview}
@router.get('/campaigns/{id}/discovery/{run_id}')
async def discovery_run(id:str,run_id:str,db:AsyncSession=Depends(get_session),identity=Depends(require_manager)):
    await campaign(id,db); run=await db.get(AgentRun,run_id)
    if not run or run.campaign_id!=id or run.agent_type!='DISCOVERY': raise HTTPException(404,'Discovery run not found')
    data=run.output_data or {}
    return {'run_id':run.id,'status':run.status,'candidate_count':data.get('candidate_count',0),'started_at':run.created_at,'completed_at':run.updated_at if run.status in ['COMPLETED','FAILED'] else None,'error':data.get('error'),'dronahq_execution_id':data.get('dronahq_execution_id'),'tool':data.get('tool','APOLLO')}
@router.post('/campaigns/{id}/prospects/{prospect_id}/research')
async def research_prospect(id:str,prospect_id:str,data:ResearchRequestIn=ResearchRequestIn(),db:AsyncSession=Depends(get_session),identity=Depends(require_manager)):
    c=await campaign(id,db)
    cp=await db.scalar(select(CampaignProspect).where(CampaignProspect.campaign_id==id,CampaignProspect.prospect_id==prospect_id))
    if not cp: raise HTTPException(404,'Prospect is not selected for this campaign')
    p=await db.get(Prospect,prospect_id)
    source_data=p.metadata_ or {}
    if not source_data.get('source_id'): raise HTTPException(409,'Prospect has no discovery source information')
    existing=await db.scalar(select(ProspectResearch).where(ProspectResearch.campaign_id==id,ProspectResearch.prospect_id==prospect_id).order_by(ProspectResearch.updated_at.desc()))
    if existing and not data.force_refresh: return out(existing)
    running=await db.scalar(select(AgentRun).where(AgentRun.campaign_id==id,AgentRun.prospect_id==prospect_id,AgentRun.agent_type=='RESEARCH',AgentRun.status.in_(['QUEUED','RUNNING'])))
    if running: raise HTTPException(409,detail={'code':'RESEARCH_ALREADY_RUNNING','run_id':running.id})
    allowed=await PolicyEngine().check_agent_execution(db,c,'RESEARCH')
    if not allowed.allowed: raise HTTPException(409,detail={'code':allowed.rule,'message':allowed.reason})
    icp={'geography':c.target_geography,'target_roles':c.target_roles,'industries':c.target_industries,'company_size':c.company_size}
    candidate={'source':source_data.get('discovery_source'),'source_id':source_data['source_id'],'person_name':f'{p.first_name} {p.last_name}'.strip(),'first_name':p.first_name,'last_name':p.last_name,'title':p.title,'email':p.email,'linkedin_url':p.linkedin_url,'company_name':source_data.get('company_name'),'company_domain':p.website,'company_size':p.employee_count,'industry':p.industry,'source_url':source_data.get('source_url',''),'discovery_signals':source_data.get('discovery_signals',[]),'unverified_criteria':source_data.get('unmatched_criteria',[])}
    run=AgentRun(campaign_id=id,prospect_id=prospect_id,agent_type='RESEARCH',status='RUNNING',input_data={'candidate_source_id':candidate['source_id'],'tool':'WEB_SEARCH'}); db.add(run); await db.flush()
    try:
        result=await ResearchService().research_candidate(id,c.name,icp,candidate)
    except DiscoveryProviderError as exc:
        run.status='FAILED'; run.output_data={'error_code':exc.code,'error':exc.message,'tool':'WEB_SEARCH'}; audit(db,'RESEARCH_FAILED','agent_run',run.id,{'actor':identity[0].id,'role':'MANAGER','campaign_id':id,'prospect_id':prospect_id,'reason':exc.code}); await db.commit(); raise HTTPException(503,detail={'code':exc.code,'message':exc.message,'run_id':run.id})
    values={'status':result.candidate_status,'research_summary':result.research_summary,'person_research':result.person_research,'company_research':result.company_research,'icp_evidence':[x.model_dump() for x in result.icp_evidence],'business_context':result.business_context,'personalization_signals':result.personalization_signals,'sources':result.sources,'uncertainties':result.uncertainties,'agent_run_id':run.id}
    if existing:
        for key,value in values.items(): setattr(existing,key,value)
        record=existing
    else:
        record=ProspectResearch(campaign_id=id,prospect_id=prospect_id,**values); db.add(record); await db.flush()
    run.status='COMPLETED'; run.output_data={'tool':'WEB_SEARCH','dronahq_execution_id':result.execution_id,'research_id':record.id,'candidate_status':result.candidate_status}; p.lifecycle_status='RESEARCHED'
    audit(db,'RESEARCH_COMPLETED','prospect_research',record.id,{'actor':identity[0].id,'role':'MANAGER','campaign_id':id,'prospect_id':prospect_id,'run_id':run.id}); await db.commit(); return out(record)
@router.post('/campaigns/{id}/prospects/{prospect_id}/fitment')
async def fitment_prospect(id:str,prospect_id:str,data:FitmentRequestIn=FitmentRequestIn(),db:AsyncSession=Depends(get_session),identity=Depends(require_manager)):
    c=await campaign(id,db)
    if not await db.scalar(select(CampaignProspect).where(CampaignProspect.campaign_id==id,CampaignProspect.prospect_id==prospect_id)): raise HTTPException(404,'Prospect is not selected for this campaign')
    research=await db.scalar(select(ProspectResearch).where(ProspectResearch.campaign_id==id,ProspectResearch.prospect_id==prospect_id).order_by(ProspectResearch.updated_at.desc()))
    if not research: raise HTTPException(409,'Completed research is required before ICP fitment')
    existing=await db.scalar(select(ProspectFitment).where(ProspectFitment.campaign_id==id,ProspectFitment.prospect_id==prospect_id).order_by(ProspectFitment.updated_at.desc()))
    if existing and not data.force_refresh and existing.research_id==research.id: return out(existing)
    allowed=await PolicyEngine().check_agent_execution(db,c,'ICP_FITMENT')
    if not allowed.allowed: raise HTTPException(409,detail={'code':allowed.rule,'message':allowed.reason})
    run=AgentRun(campaign_id=id,prospect_id=prospect_id,agent_type='ICP_FITMENT',status='RUNNING',input_data={'research_id':research.id,'engine_version':'icp-fitment-v1','execution_type':'DETERMINISTIC'}); db.add(run); await db.flush()
    try:
        setup=await setup_for(c,db); p=await db.get(Prospect,prospect_id)
        result=ICPFitmentEngine().evaluate({'geography':c.target_geography,'target_roles':c.target_roles,'industries':c.target_industries,'company_size':c.company_size},{'person_research':research.person_research,'company_research':research.company_research,'business_context':research.business_context,'uncertainties':research.uncertainties},{'title':p.title,'industry':p.industry,'location':p.location,'employee_count':p.employee_count},setup.exclusion_criteria)
    except Exception as exc:
        run.status='FAILED'; run.output_data={'error':'Fitment evaluation failed','engine_version':'icp-fitment-v1'}; audit(db,'ICP_FITMENT_FAILED','agent_run',run.id,{'actor':identity[0].id,'role':'MANAGER','campaign_id':id,'prospect_id':prospect_id}); await db.commit(); raise HTTPException(422,'Malformed ICP or research data') from exc
    values={**result,'research_id':research.id}
    if existing:
        for key,value in values.items(): setattr(existing,key,value)
        record=existing
    else:
        record=ProspectFitment(campaign_id=id,prospect_id=prospect_id,**values); db.add(record); await db.flush()
    cp=await db.scalar(select(CampaignProspect).where(CampaignProspect.campaign_id==id,CampaignProspect.prospect_id==prospect_id)); cp.qualification_status=result['overall_fit_status']; cp.qualification_score=result['overall_fit_score']; cp.qualification_reason='; '.join(result['key_fit_signals']+result['key_risk_factors']); cp.current_stage=result['recommended_next_stage']
    run.status='COMPLETED'; run.output_data={'engine_version':'icp-fitment-v1','research_id':research.id,'fitment_id':record.id,'overall_fit_score':result['overall_fit_score'],'recommended_next_stage':result['recommended_next_stage'],'execution_type':'DETERMINISTIC'}
    audit(db,'ICP_FITMENT_COMPLETED','prospect_fitment',record.id,{'actor':identity[0].id,'role':'MANAGER','campaign_id':id,'prospect_id':prospect_id,'run_id':run.id,'engine_version':'icp-fitment-v1'}); await db.commit(); return out(record)
@router.post('/campaigns/{id}/prospects/{prospect_id}/pipeline/{stage}')
async def run_pipeline_agent(id:str,prospect_id:str,stage:str,db:AsyncSession=Depends(get_session),identity=Depends(require_manager)):
    """Run one external proposal stage; delivery remains a separate approval action."""
    stages={'strategy':'outreach_strategy','personalization':'personalization','conversation':'conversation','followup':'followup'}
    agent=stages.get(stage)
    if not agent: raise HTTPException(404,'Unknown pipeline stage')
    c=await campaign(id,db); cp=await db.scalar(select(CampaignProspect).where(CampaignProspect.campaign_id==id,CampaignProspect.prospect_id==prospect_id))
    p=await db.get(Prospect,prospect_id)
    if not cp or not p: raise HTTPException(404,'Campaign prospect not found')
    research=await db.scalar(select(ProspectResearch).where(ProspectResearch.campaign_id==id,ProspectResearch.prospect_id==prospect_id).order_by(ProspectResearch.updated_at.desc()))
    fitment=await db.scalar(select(ProspectFitment).where(ProspectFitment.campaign_id==id,ProspectFitment.prospect_id==prospect_id).order_by(ProspectFitment.updated_at.desc()))
    if stage in {'strategy','personalization'} and not fitment: raise HTTPException(409,'Completed ICP fitment is required')
    policy=await PolicyEngine().check_agent_execution(db,c,agent.upper())
    if not policy.allowed: raise HTTPException(409,detail={'code':policy.rule,'message':policy.reason})
    previous=(await db.scalars(select(OutreachEvent).where(OutreachEvent.campaign_id==id,OutreachEvent.prospect_id==prospect_id))).all()
    conversation=await db.scalar(select(Conversation).where(Conversation.campaign_id==id,Conversation.prospect_id==prospect_id))
    messages=(await db.scalars(select(Message).where(Message.conversation_id==conversation.id).order_by(Message.created_at.asc()))).all() if conversation else []
    payload=jsonable_encoder({'campaign':out(c),'prospect':out(p),'research':out(research) if research else None,'fitment':out(fitment) if fitment else None,'previous_outreach':[out(x) for x in previous],'enabled_channels':c.active_channels,'policy':policy.model_dump(),'conversation_history':[out(x) for x in messages]})
    run=AgentRun(campaign_id=id,prospect_id=prospect_id,agent_type=agent.upper(),status='RUNNING',input_data=payload); db.add(run); await db.flush()
    try:
        raw=await run_agent(agent,payload)
    except DiscoveryProviderError as exc:
        run.status='FAILED'; run.output_data={'code':exc.code,'error':exc.message}; cp.current_stage=f'{agent.upper()}_FAILED'; await db.commit()
        raise HTTPException(503,detail={'code':exc.code,'message':exc.message,'run_id':run.id}) from exc
    result=raw.get('result',raw.get('data',raw)) if isinstance(raw,dict) else {}
    run.status='COMPLETED'; run.output_data=result
    if stage=='strategy': cp.current_stage='STRATEGY_READY'
    elif stage=='personalization':
        body=result.get('draft',result.get('body','')) if isinstance(result,dict) else ''
        if not body: run.status='FAILED'; cp.current_stage='PERSONALIZATION_FAILED'; await db.commit(); raise HTTPException(502,'Personalization agent returned no draft')
        assignment=await db.scalar(select(LeadAssignment).where(LeadAssignment.campaign_prospect_id==cp.id,LeadAssignment.status=='ASSIGNED'))
        db.add(ApprovalRequest(campaign_id=id,campaign_prospect_id=cp.id,representative_id=assignment.representative_id if assignment else None,request_type='OUTREACH',payload={'channel':result.get('channel','email'),'subject':result.get('subject',''),'message':body,'agent':'PERSONALIZATION','agent_run_id':run.id}))
        cp.current_stage='PENDING_APPROVAL'
    elif stage=='conversation': cp.current_stage='CONVERSATION_ANALYZED'
    else: cp.current_stage='FOLLOW_UP_RECOMMENDED'
    await db.commit(); return {'run_id':run.id,'stage':cp.current_stage,'result':result}
@router.post('/campaigns/{id}/prospects/{prospect_id}/demo-voice-call')
async def demo_voice_call(id:str,prospect_id:str,db:AsyncSession=Depends(get_session),identity=Depends(require_manager)):
    """Simulated Voice SDR call -- explicitly DEMO/SIMULATED, never a real telephony call.
    Reuses the same PolicyEngine, Conversation, Message, and AgentRun models as every other
    channel: a blocked call is recorded exactly like a blocked email or LinkedIn send, not a
    parallel voice-only code path."""
    c=await campaign(id,db); p=await db.get(Prospect,prospect_id)
    if not p: raise HTTPException(404,'Prospect not found')
    if not await db.scalar(select(CampaignProspect).where(CampaignProspect.campaign_id==id,CampaignProspect.prospect_id==prospect_id)): raise HTTPException(404,'Prospect is not part of this campaign')
    policy=await PolicyEngine().check(db,c,prospect_id,'voice')
    if not policy.allowed:
        db.add(AgentRun(campaign_id=id,prospect_id=prospect_id,agent_type='VOICE',status='FAILED',output_data={'call_status':'BLOCKED','policy_rule':policy.rule,'reason':policy.reason}))
        await db.commit()
        raise HTTPException(409,detail={'code':policy.rule,'message':policy.reason})
    company_name=(p.metadata_ or {}).get('company_name') or p.website or p.industry
    opening=f"Hi, this is the SDR assistant calling on behalf of our team about {company_name}. Is now a good time?"
    reply="Yes, I have a few questions about the platform."
    followup="Sure. What would you like to know?"
    conversation=await db.scalar(select(Conversation).where(Conversation.campaign_id==id,Conversation.prospect_id==prospect_id))
    if not conversation: conversation=Conversation(campaign_id=id,prospect_id=prospect_id); db.add(conversation); await db.flush()
    conversation.status='MEETING_INTENT' if conversation.status!='MEETING_INTENT' else conversation.status
    db.add(Message(conversation_id=conversation.id,direction='OUTBOUND',channel='voice',content=opening))
    db.add(Message(conversation_id=conversation.id,direction='INBOUND',channel='voice',content=reply))
    db.add(Message(conversation_id=conversation.id,direction='OUTBOUND',channel='voice',content=followup))
    output={'call_status':'DEMO_CONNECTED','transcript':[{'speaker':'AI','text':opening},{'speaker':'Prospect','text':reply},{'speaker':'AI','text':followup}],'intent':'INTERESTED','outcome':'FOLLOW_UP_REQUIRED','policy':'ALLOW','human_escalation':False}
    run=AgentRun(campaign_id=id,prospect_id=prospect_id,agent_type='VOICE',status='COMPLETED',output_data=output)
    db.add(run)
    await db.flush()
    db.add(OutreachEvent(campaign_id=id,prospect_id=prospect_id,channel='voice',status='SENT',content='Simulated voice call: intent=INTERESTED, outcome=FOLLOW_UP_REQUIRED'))
    audit(db,'DEMO_VOICE_CALL','agent_run',run.id,{'actor':identity[0].id,'campaign_id':id,'prospect_id':prospect_id})
    await db.commit()
    return {'conversation_id':conversation.id,**output}

@router.post('/campaigns/{id}/generate-drafts')
async def generate_drafts(id:str,data:GenerateDraftsIn,db:AsyncSession=Depends(get_session),identity=Depends(require_manager)):
    """Channel-specific outreach 'sender bot': drafts a personalized message for each
    assigned lead on this channel through the same agent pipeline as the wizard
    (falls back to a demo draft when no DronaHQ webhook is configured), and queues
    each draft into the same representative approval queue — nothing bypasses approval."""
    requested=data.channel.lower(); channel='message' if requested=='sms' else requested
    if channel not in ['email','linkedin','message','voice']: raise HTTPException(422,'Unsupported channel')
    c=await campaign(id,db)
    if channel not in (c.active_channels or []): raise HTTPException(409,f'{requested} is not an active channel for this campaign')
    policy=await PolicyEngine().check_agent_execution(db,c,'PERSONALIZATION')
    if not policy.allowed: raise HTTPException(409,detail={'code':policy.rule,'message':policy.reason})
    field=CHANNEL_RECIPIENT_FIELD.get(channel,'email')
    rows=(await db.execute(select(CampaignProspect,Prospect).join(Prospect,CampaignProspect.prospect_id==Prospect.id).where(CampaignProspect.campaign_id==id))).all()
    drafted=[]; skipped=[]
    for cp,p in rows:
        if len(drafted)>=data.limit: break
        if not getattr(p,field,''): skipped.append({'prospect_id':p.id,'reason':f'Prospect has no value for {field}'}); continue
        if await db.scalar(select(ApprovalRequest).where(ApprovalRequest.campaign_prospect_id==cp.id,ApprovalRequest.status=='PENDING')): skipped.append({'prospect_id':p.id,'reason':'Already has a pending draft'}); continue
        assignment=await db.scalar(select(LeadAssignment).where(LeadAssignment.campaign_prospect_id==cp.id,LeadAssignment.status=='ASSIGNED'))
        if not assignment: skipped.append({'prospect_id':p.id,'reason':'No representative assigned to this lead'}); continue
        # Retrieved BEFORE generation and persisted on the approval below, so the
        # approval drawer shows exactly what was used at draft time -- never a live
        # re-query that could drift from what the draft was actually generated with.
        rag_context=await SimpleRetriever().retrieve(db,f'{c.instructions} {p.industry} {p.title}',campaign_id=id)
        payload=jsonable_encoder({'campaign':out(c),'prospect':out(p),'channel':channel,'rag_context':rag_context})
        run=AgentRun(campaign_id=id,prospect_id=p.id,agent_type='PERSONALIZATION',status='RUNNING',input_data=payload); db.add(run); await db.flush()
        try:
            raw=await run_agent('personalization',payload)
        except DiscoveryProviderError as exc:
            run.status='FAILED'; run.output_data={'code':exc.code,'error':exc.message}; skipped.append({'prospect_id':p.id,'reason':exc.message}); continue
        result=raw.get('result',raw.get('data',raw)) if isinstance(raw,dict) else {}
        body=result.get('draft',result.get('body','')) if isinstance(result,dict) else ''
        if not body: run.status='FAILED'; run.output_data={'error':'Agent returned no draft'}; skipped.append({'prospect_id':p.id,'reason':'Agent returned no draft'}); continue
        run.status='COMPLETED'; run.output_data=result
        db.add(ApprovalRequest(campaign_id=id,campaign_prospect_id=cp.id,representative_id=assignment.representative_id,request_type='OUTREACH',payload={'channel':channel,'subject':result.get('subject',''),'message':body,'agent':'PERSONALIZATION','agent_run_id':run.id,'rag_context':rag_context}))
        cp.current_stage='PENDING_APPROVAL'; drafted.append(p.id)
    audit(db,'DRAFTS_GENERATED','campaign',id,{'actor':identity[0].id,'channel':channel,'drafted':len(drafted),'skipped':len(skipped)})
    await db.commit(); return {'channel':channel,'drafted':drafted,'skipped':skipped}
@router.post('/campaigns/{id}/prospects/import')
async def import_prospects(id:str,data:ProspectImportIn,db:AsyncSession=Depends(get_session),identity=Depends(require_manager)):
    await draft(id,db); ids=[]
    for item in data.prospects:
        p=await db.scalar(select(Prospect).where(Prospect.email==item.email))
        if not p: p=Prospect(**item.model_dump()); db.add(p); await db.flush()
        ids.append(p.id)
    b=ProspectBatch(campaign_id=id,mode='SEED_LIST',prospect_ids=ids,created_by_id=identity[0].id); db.add(b); audit(db,'PROSPECT_BATCH_DISCOVERED','campaign',id,{'batch_id':b.id}); await db.commit(); return {'batch_id':b.id,'count':len(ids)}
@router.get('/campaigns/{id}/prospects/preview')
async def preview(id:str,db:AsyncSession=Depends(get_session),identity=Depends(require_manager)):
    c=await campaign(id,db); batches=(await db.scalars(select(ProspectBatch).where(ProspectBatch.campaign_id==id,ProspectBatch.status=='PREVIEW'))).all(); ids=[x for b in batches for x in b.prospect_ids]; return [await fit(db,c,await db.get(Prospect,x)) for x in ids]
@router.post('/campaigns/{id}/prospects/approve-batch')
async def approve_batch(id:str,db:AsyncSession=Depends(get_session),identity=Depends(require_manager)):
    await draft(id,db); batches=(await db.scalars(select(ProspectBatch).where(ProspectBatch.campaign_id==id,ProspectBatch.status=='PREVIEW'))).all()
    for b in batches: b.status='APPROVED'
    audit(db,'PROSPECT_BATCH_APPROVED','campaign',id,{'count':len(batches)}); await db.commit(); return {'approved_batches':len(batches)}
async def _auto_progress_prospect(db,c,p,cp,icp,setup,*,do_fitment:bool):
    """Best-effort demo realism: runs the same RESEARCH (and optionally ICP_FITMENT)
    steps a manager could trigger by hand from the prospect detail page, so a freshly
    enrolled discovery batch shows a believable multi-stage funnel immediately rather
    than every prospect sitting at PREVIEW until clicked through one at a time. Only
    ever applied to prospects that carry discovery source metadata; never raises --
    a failure here just leaves that prospect at its prior stage."""
    source_data=p.metadata_ or {}
    if not source_data.get('source_id'): return
    candidate={'source':source_data.get('discovery_source'),'source_id':source_data['source_id'],'person_name':f'{p.first_name} {p.last_name}'.strip(),'first_name':p.first_name,'last_name':p.last_name,'title':p.title,'email':p.email,'linkedin_url':p.linkedin_url,'company_name':source_data.get('company_name'),'company_domain':p.website,'company_size':p.employee_count,'industry':p.industry,'source_url':source_data.get('source_url',''),'discovery_signals':source_data.get('discovery_signals',[]),'unverified_criteria':source_data.get('unmatched_criteria',[])}
    research_run=AgentRun(campaign_id=c.id,prospect_id=p.id,agent_type='RESEARCH',status='RUNNING',input_data={'candidate_source_id':candidate['source_id'],'tool':'WEB_SEARCH'}); db.add(research_run); await db.flush()
    try:
        result=await ResearchService().research_candidate(c.id,c.name,icp,candidate)
    except DiscoveryProviderError:
        research_run.status='FAILED'; return
    research_run.status='COMPLETED'
    record=ProspectResearch(campaign_id=c.id,prospect_id=p.id,status=result.candidate_status,research_summary=result.research_summary,person_research=result.person_research,company_research=result.company_research,icp_evidence=[x.model_dump() for x in result.icp_evidence],business_context=result.business_context,personalization_signals=result.personalization_signals,sources=result.sources,uncertainties=result.uncertainties,agent_run_id=research_run.id)
    db.add(record); await db.flush(); p.lifecycle_status='RESEARCHED'
    if not do_fitment: return
    fitment_run=AgentRun(campaign_id=c.id,prospect_id=p.id,agent_type='ICP_FITMENT',status='RUNNING',input_data={'research_id':record.id,'engine_version':'icp-fitment-v1','execution_type':'DETERMINISTIC'}); db.add(fitment_run); await db.flush()
    try:
        fitment=ICPFitmentEngine().evaluate({'geography':c.target_geography,'target_roles':c.target_roles,'industries':c.target_industries,'company_size':c.company_size},{'person_research':record.person_research,'company_research':record.company_research,'business_context':record.business_context,'uncertainties':record.uncertainties},{'title':p.title,'industry':p.industry,'location':p.location,'employee_count':p.employee_count},setup.exclusion_criteria)
    except Exception:
        fitment_run.status='FAILED'; return
    fitment_run.status='COMPLETED'
    db.add(ProspectFitment(campaign_id=c.id,prospect_id=p.id,research_id=record.id,**fitment))
    cp.qualification_status=fitment['overall_fit_status']; cp.qualification_score=fitment['overall_fit_score']; cp.qualification_reason='; '.join(fitment['key_fit_signals']+fitment['key_risk_factors']); cp.current_stage=fitment['recommended_next_stage']
    p.lifecycle_status='QUALIFIED' if fitment['overall_fit_status']=='STRONG_FIT' else p.lifecycle_status

@router.post('/campaigns/{id}/prospects/select')
async def select_prospects(id:str,data:ProspectSelectIn,db:AsyncSession=Depends(get_session),identity=Depends(require_manager)):
    c=await draft(id,db); approved={x for b in (await db.scalars(select(ProspectBatch).where(ProspectBatch.campaign_id==id,ProspectBatch.status=='APPROVED'))).all() for x in b.prospect_ids}; selected=[]; rejected=[]; enrolled=[]
    for pid in data.prospect_ids:
        p=await db.get(Prospect,pid)
        if not p or pid not in approved: rejected.append({'prospect_id':pid,'reason':'Not in approved batch'}); continue
        result=await fit(db,c,p)
        if result['suppressed'] or any(x['blocking'] for x in result['conflicts']) or result['fit_score']<data.min_fit_score: rejected.append({'prospect_id':pid,'reason':'Suppressed, conflict, or below fit threshold'}); continue
        cp=await db.scalar(select(CampaignProspect).where(CampaignProspect.campaign_id==id,CampaignProspect.prospect_id==pid))
        if not cp:
            cp=CampaignProspect(campaign_id=id,prospect_id=pid,qualification_status='PREVIEW',qualification_score=result['fit_score'],qualification_reason='; '.join(result['fit_reasons'])); db.add(cp); await db.flush()
        selected.append(pid); enrolled.append((p,cp))

    # Demo funnel realism: research the first 8 newly-enrolled prospects and carry the
    # first 6 of those through ICP fitment too, so the campaign's pipeline funnel shows
    # a proper multi-stage drop-off right after a discovery batch is enrolled.
    icp={'geography':c.target_geography,'target_roles':c.target_roles,'industries':c.target_industries,'company_size':c.company_size}
    setup=await setup_for(c,db)
    for index,(p,cp) in enumerate(enrolled[:8]):
        await _auto_progress_prospect(db,c,p,cp,icp,setup,do_fitment=index<6)

    audit(db,'PROSPECT_SELECTED','campaign',id,{'prospect_ids':selected}); await db.commit(); return {'selected':selected,'rejected':rejected}
@router.get('/campaigns/{id}/channels')
async def channels(id:str,db:AsyncSession=Depends(get_session),identity=Depends(require_manager)):
    await campaign(id,db); return [out(x) for x in (await db.scalars(select(CampaignChannelSettings).where(CampaignChannelSettings.campaign_id==id))).all()]
@router.patch('/campaigns/{id}/channels')
async def save_channels(id:str,data:ChannelSettingsIn,db:AsyncSession=Depends(get_session),identity=Depends(require_manager)):
    c=await draft(id,db)
    for value in data.channels:
        name=value.get('channel','').lower()
        if name not in ['email','linkedin','message','voice']: raise HTTPException(422,'Unsupported channel')
        row=await db.scalar(select(CampaignChannelSettings).where(CampaignChannelSettings.campaign_id==id,CampaignChannelSettings.channel==name))
        if not row: row=CampaignChannelSettings(campaign_id=id,channel=name); db.add(row)
        row.enabled=bool(value.get('enabled',True)); row.daily_limit=int(value.get('daily_limit',25)); row.working_hours=value.get('working_hours',{}); row.approval_required=bool(value.get('approval_required',False))
    c.active_channels=[x.channel for x in (await db.scalars(select(CampaignChannelSettings).where(CampaignChannelSettings.campaign_id==id,CampaignChannelSettings.enabled==True))).all()]
    c.approval_required=any(bool(value.get('approval_required', False)) for value in data.channels if bool(value.get('enabled', True)))
    audit(db,'CHANNELS_UPDATED','campaign',id); await db.commit(); return await channels(id,db,identity)
@router.get('/campaigns/{id}/prompts')
async def prompts(id:str,db:AsyncSession=Depends(get_session),identity=Depends(require_manager)):
    await campaign(id,db); return [out(x) for x in (await db.scalars(select(PromptVersion).where(PromptVersion.configuration['campaign_id'].as_string()==id))).all()]
@router.post('/campaigns/{id}/prompts')
async def create_prompt(id:str,data:PromptIn,db:AsyncSession=Depends(get_session),identity=Depends(require_manager)):
    await draft(id,db); count=await db.scalar(select(func.count()).select_from(PromptVersion).where(PromptVersion.agent_type==data.agent_type)) or 0; config={**data.configuration,'campaign_id':id,'created_by':identity[0].id}; p=PromptVersion(agent_type=data.agent_type,version=f'1.{count}.0',prompt_text=data.prompt_text,configuration=config,active=False); db.add(p); await db.flush(); audit(db,'PROMPT_CREATED','prompt',p.id); await db.commit(); return out(p)
@router.post('/campaigns/{id}/prompts/{prompt_id}/activate')
async def activate_prompt(id:str,prompt_id:str,db:AsyncSession=Depends(get_session),identity=Depends(require_manager)):
    await draft(id,db); p=await db.get(PromptVersion,prompt_id)
    if not p or p.configuration.get('campaign_id')!=id: raise HTTPException(404,'Campaign prompt not found')
    others=(await db.scalars(select(PromptVersion).where(PromptVersion.agent_type==p.agent_type,PromptVersion.configuration['campaign_id'].as_string()==id))).all()
    for item in others: item.active=item.id==p.id
    audit(db,'PROMPT_ACTIVATED','prompt',p.id); await db.commit(); return out(p)

# Campaign knowledge base: the source material SimpleRetriever's campaign-scoped RAG
# (app/rag/retriever.py) draws on when drafting outreach for this campaign. A manager
# adds a document here (pasted text, or a .txt/.md file read client-side since the
# browser already has the text); it's stored as a KnowledgeDocument scoped to this
# campaign and immediately eligible for retrieval on the next generated draft.
@router.get('/campaigns/{id}/knowledge')
async def list_knowledge(id:str,db:AsyncSession=Depends(get_session),identity=Depends(require_manager)):
    await campaign(id,db)
    rows=(await db.scalars(select(KnowledgeDocument).where(KnowledgeDocument.category==f'campaign_{id}').order_by(KnowledgeDocument.created_at.desc()))).all()
    return [out(x) for x in rows]
@router.post('/campaigns/{id}/knowledge')
async def add_knowledge(id:str,data:HurdleKnowledgeIn,db:AsyncSession=Depends(get_session),identity=Depends(require_manager)):
    await campaign(id,db)
    if not data.title.strip() or not data.content.strip(): raise HTTPException(422,'title and content are required')
    doc=KnowledgeDocument(title=data.title.strip(),content=data.content.strip(),category=f'campaign_{id}')
    db.add(doc); await db.flush()
    audit(db,'KNOWLEDGE_ATTACHED','knowledge_document',doc.id,{'actor':identity[0].id,'campaign_id':id})
    await db.commit(); return out(doc)
@router.delete('/campaigns/{id}/knowledge/{doc_id}')
async def remove_knowledge(id:str,doc_id:str,db:AsyncSession=Depends(get_session),identity=Depends(require_manager)):
    await campaign(id,db)
    doc=await db.get(KnowledgeDocument,doc_id)
    if not doc or doc.category!=f'campaign_{id}': raise HTTPException(404,'Knowledge document not found on this campaign')
    await db.delete(doc)
    audit(db,'KNOWLEDGE_REMOVED','knowledge_document',doc_id,{'actor':identity[0].id,'campaign_id':id})
    await db.commit(); return {'status':'removed'}

async def launch_checks(c,db):
    setup=await setup_for(c,db); agents=await db.scalar(select(func.count()).select_from(CampaignAgent).where(CampaignAgent.campaign_id==c.id,CampaignAgent.enabled==True)) or 0; prospects=(await db.scalars(select(CampaignProspect).where(CampaignProspect.campaign_id==c.id))).all(); channels=await db.scalar(select(func.count()).select_from(CampaignChannelSettings).where(CampaignChannelSettings.campaign_id==c.id,CampaignChannelSettings.enabled==True)) or 0; prompts_count=await db.scalar(select(func.count()).select_from(PromptVersion).where(PromptVersion.configuration['campaign_id'].as_string()==c.id,PromptVersion.active==True)) or 0; reps=await db.scalar(select(func.count()).select_from(CampaignAssignment).where(CampaignAssignment.campaign_id==c.id,CampaignAssignment.active==True)) or 0
    has_conflicts = False
    for cp in prospects:
        p = await db.get(Prospect, cp.prospect_id)
        if p:
            assessment = await fit(db, c, p)
            if assessment['suppressed'] or any(x['blocking'] for x in assessment['conflicts']):
                has_conflicts = True
                break
    return [('identity','Campaign identity configured',bool(c.name and setup.owner_id)),('icp','ICP configured',bool(c.target_roles or c.target_industries)),('agents','At least one agent enabled',bool(agents)),('prospects','Prospects sourced and approved',bool(prospects)),('channels','At least one channel enabled',bool(channels)),('prompts','At least one prompt reviewed',bool(prompts_count)),('representative','Representative assigned',bool(reps)),('conflicts','No blocking suppression/conflict state',not has_conflicts),('draft','Campaign is currently DRAFT',c.status=='DRAFT')]
@router.get('/campaigns/{id}/launch-check')
async def launch_check(id:str,db:AsyncSession=Depends(get_session),identity=Depends(require_manager)):
    c=await campaign(id,db); checks=[{'key':k,'label':l,'passed':p} for k,l,p in await launch_checks(c,db)]; return {'ready':all(x['passed'] for x in checks),'checks':checks}
@router.get('/campaigns/{campaign_id}/rep-matches')
async def rep_matches(campaign_id:str,db:AsyncSession=Depends(get_session),identity=Depends(require_manager)):
    """Rank active representatives by deterministic configuration compatibility."""
    c=await campaign(campaign_id,db)
    channel_rows=(await db.scalars(select(CampaignChannelSettings).where(CampaignChannelSettings.campaign_id==c.id, CampaignChannelSettings.enabled==True))).all()
    if channel_rows:
        c.active_channels=[row.channel for row in channel_rows]
    campaign_hours=next((row.working_hours for row in channel_rows if row.working_hours), {})
    rows=(await db.execute(select(User,AccessProfile).join(AccessProfile).where(AccessProfile.role=='REPRESENTATIVE', AccessProfile.active==True))).all()
    engine=RepMatchEngine(); results=[]
    for user, profile in rows:
        current_load=await db.scalar(select(func.count()).select_from(LeadAssignment).where(LeadAssignment.representative_id==user.id, LeadAssignment.status=='ASSIGNED')) or 0
        match=engine.evaluate(c, profile, current_load=current_load, campaign_working_hours=campaign_hours)
        results.append({'representative_id':user.id, 'representative':out(user), **match})
    return sorted(results, key=lambda item: (-item['score'], item['representative_id']))
@router.get('/campaigns/{id}/team')
async def campaign_team(id:str,db:AsyncSession=Depends(get_session),identity=Depends(require_manager)):
    """Who's working this campaign, and which prospect each of them is in talks with — the manager's roll-up view from Campaign Detail."""
    await campaign(id,db)
    assignments=(await db.execute(select(CampaignAssignment,User).join(User,CampaignAssignment.representative_id==User.id).where(CampaignAssignment.campaign_id==id,CampaignAssignment.active==True))).all()
    result=[]
    for assignment,user in assignments:
        lead_rows=(await db.execute(select(LeadAssignment,CampaignProspect,Prospect).join(CampaignProspect,LeadAssignment.campaign_prospect_id==CampaignProspect.id).join(Prospect,CampaignProspect.prospect_id==Prospect.id).where(CampaignProspect.campaign_id==id,LeadAssignment.representative_id==user.id,LeadAssignment.status=='ASSIGNED'))).all()
        leads=[]
        for _,cp,p in lead_rows:
            conversation=await db.scalar(select(Conversation).where(Conversation.campaign_id==id,Conversation.prospect_id==p.id))
            leads.append({'prospect':out(p),'stage':cp.current_stage,'qualification_status':cp.qualification_status,'conversation_status':conversation.status if conversation else None})
        result.append({'representative':out(user),'assignment':out(assignment),'leads':leads})
    return result
@router.patch('/campaigns/{id}/representatives-config')
async def save_rep_config(id:str,data:dict,db:AsyncSession=Depends(get_session),identity=Depends(require_manager)):
    c=await draft(id,db); s=await setup_for(c,db); s.representative_settings=data; await db.commit(); return s.representative_settings or {}
@router.get('/campaigns/{id}/representatives-config')
async def get_rep_config(id:str,db:AsyncSession=Depends(get_session),identity=Depends(require_manager)):
    c=await campaign(id,db); s=await setup_for(c,db); return s.representative_settings or {}
@router.post('/campaigns/{id}/activate')
async def activate(id:str,db:AsyncSession=Depends(get_session),identity=Depends(require_manager)):
    c=await campaign(id,db); check=await launch_check(id,db,identity)
    if not check['ready']: raise HTTPException(422,detail={'message':'Launch validation failed','checks':check['checks']})
    c.status='LIVE'; audit(db,'CAMPAIGN_ACTIVATED','campaign',id); await db.commit(); return out(c)
@router.post('/campaigns/{id}/{action}')
async def lifecycle(id:str,action:str,db:AsyncSession=Depends(get_session),identity=Depends(require_manager)):
    if action not in ['pause','resume']: raise HTTPException(404,'Unknown action')
    c=await campaign(id,db)
    if action=='pause' and c.status!='LIVE': raise HTTPException(409,'Only live campaigns can be paused')
    if action=='resume' and c.status!='PAUSED': raise HTTPException(409,'Only paused campaigns can resume')
    previous=c.status; c.status='PAUSED' if action=='pause' else 'LIVE'; audit(db,'CAMPAIGN_PAUSED' if action=='pause' else 'CAMPAIGN_RESUMED','campaign',id,{'actor':identity[0].id,'role':'MANAGER','previous_state':previous,'new_state':c.status}); await db.commit(); return out(c)

# --- Platform Settings: suppression/DNC, notification thresholds, team/permissions. ---
# Global config not scoped to any one campaign, distinct from the per-campaign wizard settings above.
@router.get('/suppression')
async def list_suppression(db:AsyncSession=Depends(get_session),identity=Depends(require_manager)):
    rows=(await db.execute(select(SuppressionEntry,Prospect).join(Prospect,SuppressionEntry.prospect_id==Prospect.id).order_by(SuppressionEntry.created_at.desc()))).all()
    return [{'entry':out(e),'prospect':out(p)} for e,p in rows]
@router.post('/suppression')
async def add_suppression(data:SuppressionIn,db:AsyncSession=Depends(get_session),identity=Depends(require_manager)):
    p=await db.scalar(select(Prospect).where(Prospect.email==data.prospect_email.strip().lower()))
    if not p: raise HTTPException(404,'No known prospect with that email; suppression only applies to prospects already in the system')
    existing=await db.scalar(select(SuppressionEntry).where(SuppressionEntry.prospect_id==p.id,SuppressionEntry.active==True))
    if existing: return {'entry':out(existing),'prospect':out(p)}
    entry=SuppressionEntry(prospect_id=p.id,reason=data.reason,active=True); db.add(entry); await db.flush()
    audit(db,'SUPPRESSION_ADDED','suppression_entry',entry.id,{'actor':identity[0].id,'prospect_id':p.id,'reason':data.reason}); await db.commit()
    return {'entry':out(entry),'prospect':out(p)}
@router.delete('/suppression/{entry_id}')
async def remove_suppression(entry_id:str,db:AsyncSession=Depends(get_session),identity=Depends(require_manager)):
    entry=await db.get(SuppressionEntry,entry_id)
    if not entry: raise HTTPException(404,'Suppression entry not found')
    entry.active=False; audit(db,'SUPPRESSION_REMOVED','suppression_entry',entry.id,{'actor':identity[0].id,'prospect_id':entry.prospect_id}); await db.commit()
    return {'status':'removed'}
@router.get('/notification-thresholds')
async def get_notification_thresholds(identity=Depends(require_manager)):
    return {'approval_aging_threshold_hours':settings().approval_aging_threshold_hours,'capacity_alert_threshold_pct':settings().capacity_alert_threshold_pct}
@router.patch('/notification-thresholds')
async def update_notification_thresholds(data:NotificationThresholdsIn,db:AsyncSession=Depends(get_session),identity=Depends(require_manager)):
    settings().approval_aging_threshold_hours=data.approval_aging_threshold_hours
    settings().capacity_alert_threshold_pct=data.capacity_alert_threshold_pct
    audit(db,'NOTIFICATION_THRESHOLDS_UPDATED','settings','global',{'actor':identity[0].id,**data.model_dump()}); await db.commit()
    return {'approval_aging_threshold_hours':settings().approval_aging_threshold_hours,'capacity_alert_threshold_pct':settings().capacity_alert_threshold_pct}
@router.get('/team-permissions')
async def list_manager_permissions(db:AsyncSession=Depends(get_session),identity=Depends(require_manager)):
    rows=(await db.execute(select(User,AccessProfile).join(AccessProfile).where(AccessProfile.role=='MANAGER'))).all()
    return [{'user':out(u),'profile':out(p)} for u,p in rows]
@router.post('/team-permissions')
async def grant_manager_access(data:ManagerCreateIn,db:AsyncSession=Depends(get_session),identity=Depends(require_manager)):
    user=await db.scalar(select(User).where(User.email==data.email.strip().lower()))
    if not user: user=User(name=data.name,email=data.email.strip().lower()); db.add(user); await db.flush()
    profile=await db.scalar(select(AccessProfile).where(AccessProfile.user_id==user.id,AccessProfile.role=='MANAGER'))
    if profile: profile.active=True
    else: profile=AccessProfile(user_id=user.id,role='MANAGER',active=True); db.add(profile)
    audit(db,'MANAGER_ACCESS_GRANTED','access_profile',profile.id if profile.id else user.id,{'actor':identity[0].id,'email':user.email}); await db.commit()
    return {'user':out(user),'profile':out(profile)}
@router.delete('/team-permissions/{user_id}')
async def revoke_manager_access(user_id:str,db:AsyncSession=Depends(get_session),identity=Depends(require_manager)):
    if user_id==identity[0].id: raise HTTPException(409,'You cannot revoke your own manager access')
    profile=await db.scalar(select(AccessProfile).where(AccessProfile.user_id==user_id,AccessProfile.role=='MANAGER'))
    if not profile: raise HTTPException(404,'Manager access record not found')
    profile.active=False; audit(db,'MANAGER_ACCESS_REVOKED','access_profile',profile.id,{'actor':identity[0].id,'target_user_id':user_id}); await db.commit()
    return {'status':'revoked'}
@router.get('/integrations-status')
async def integrations_status(identity=Depends(require_manager)):
    """Read-only: these are environment-managed (webhook URLs/API keys, LLM provider), not editable from the UI."""
    return {'llm_provider':settings().llm_provider,'demo_mode':settings().demo_mode,'agents':public_agent_status()}
