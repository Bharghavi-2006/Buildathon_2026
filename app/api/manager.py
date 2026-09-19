from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func
from datetime import datetime, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from app.api.auth import require_manager
from app.db.session import get_session
from app.db.models import *
from app.schemas import *
from app.discovery.mock import MockLeadDiscoveryProvider
from app.core.config import settings

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
        cards.append({'id':c.id,'name':c.name,'icp_summary':f"{', '.join(c.target_roles)} / {', '.join(c.target_industries)}",'status':c.status,'prospect_count':await db.scalar(select(func.count()).select_from(CampaignProspect).where(CampaignProspect.campaign_id==c.id)) or 0,'outreach_sent':await db.scalar(select(func.count()).select_from(OutreachEvent).where(OutreachEvent.campaign_id==c.id,OutreachEvent.status=='SENT')) or 0,'meetings_booked':await db.scalar(select(func.count()).select_from(Conversation).where(Conversation.campaign_id==c.id,Conversation.status=='MEETING_INTENT')) or 0,'created_at':c.created_at,'updated_at':c.updated_at})
    return {'pending_approvals':await db.scalar(select(func.count()).select_from(ApprovalRequest).where(ApprovalRequest.status=='PENDING')) or 0,'replies_needing_attention':await db.scalar(select(func.count()).select_from(Conversation).where(Conversation.status=='OPEN')) or 0,'meetings_booked_today':sum(x['meetings_booked'] for x in cards),'active_alerts':0,'campaigns':cards}
@router.get('/campaigns')
async def campaigns(db:AsyncSession=Depends(get_session),identity=Depends(require_manager)): return (await dashboard(db,identity))['campaigns']
@router.get('/alerts')
async def alerts(identity=Depends(require_manager)): return []
@router.post('/campaigns')
async def create(data:ManagerCampaignCreate,db:AsyncSession=Depends(get_session),identity=Depends(require_manager)):
    c=Campaign(name=data.name,description=data.description,status='DRAFT'); db.add(c); await db.flush(); db.add(CampaignSetup(campaign_id=c.id,owner_id=identity[0].id))
    for agent_type in ['ICP_FITMENT','RESEARCH','OUTREACH_STRATEGY','PERSONALIZATION','CONVERSATION','FOLLOW_UP','VOICE']: db.add(CampaignAgent(campaign_id=c.id,agent_type=agent_type,enabled=False))
    audit(db,'CAMPAIGN_CREATED','campaign',c.id); await db.commit(); return out(c)
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
    return [{'approval_id':a.id,'representative':{'id':u.id,'name':u.name},'campaign':{'id':c.id,'name':c.name},'prospect':dump(p) if p else None,'age_hours':int((datetime.utcnow()-a.created_at).total_seconds()/3600),'channel':a.payload.get('channel','email'),'message_preview':a.payload.get('message',a.payload.get('summary',''))[:200],'created_at':a.created_at,'status':'AGING'} for a,u,c,cp,p in rows]
@router.post('/campaigns/{id}/prospects/discover')
async def discover(id:str,db:AsyncSession=Depends(get_session),identity=Depends(require_manager)):
    c=await draft(id,db); found=[]
    for item in await MockLeadDiscoveryProvider().discover({'geography':c.target_geography,'target_roles':c.target_roles,'industries':c.target_industries}):
        p=await db.scalar(select(Prospect).where(Prospect.email==item.email))
        if not p: p=Prospect(**item.model_dump()); db.add(p); await db.flush()
        found.append(p.id)
    batch=ProspectBatch(campaign_id=id,mode='AUTO_DISCOVER',prospect_ids=found,created_by_id=identity[0].id); db.add(batch); audit(db,'PROSPECT_BATCH_DISCOVERED','campaign',id,{'batch_id':batch.id}); await db.commit(); return {'batch_id':batch.id,'prospects':[await fit(db,c,await db.get(Prospect,x)) for x in found]}
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
@router.post('/campaigns/{id}/prospects/select')
async def select_prospects(id:str,data:ProspectSelectIn,db:AsyncSession=Depends(get_session),identity=Depends(require_manager)):
    c=await draft(id,db); approved={x for b in (await db.scalars(select(ProspectBatch).where(ProspectBatch.campaign_id==id,ProspectBatch.status=='APPROVED'))).all() for x in b.prospect_ids}; selected=[]; rejected=[]
    for pid in data.prospect_ids:
        p=await db.get(Prospect,pid)
        if not p or pid not in approved: rejected.append({'prospect_id':pid,'reason':'Not in approved batch'}); continue
        result=await fit(db,c,p)
        if result['suppressed'] or any(x['blocking'] for x in result['conflicts']) or result['fit_score']<60: rejected.append({'prospect_id':pid,'reason':'Suppressed, conflict, or ICP fit failure'}); continue
        if not await db.scalar(select(CampaignProspect).where(CampaignProspect.campaign_id==id,CampaignProspect.prospect_id==pid)): db.add(CampaignProspect(campaign_id=id,prospect_id=pid,qualification_status='PREVIEW',qualification_score=result['fit_score'],qualification_reason='; '.join(result['fit_reasons'])))
        selected.append(pid)
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
    audit(db,'CHANNELS_UPDATED','campaign',id); await db.commit(); return await channels(id,db,identity)
@router.get('/campaigns/{id}/prompts')
async def prompts(id:str,db:AsyncSession=Depends(get_session),identity=Depends(require_manager)):
    await campaign(id,db); return [out(x) for x in (await db.scalars(select(PromptVersion).where(PromptVersion.configuration['campaign_id'].as_string()==id))).all()]
@router.post('/campaigns/{id}/prompts')
async def create_prompt(id:str,data:PromptIn,db:AsyncSession=Depends(get_session),identity=Depends(require_manager)):
    await draft(id,db); count=await db.scalar(select(func.count()).select_from(PromptVersion).where(PromptVersion.agent_type==data.agent_type)) or 0; config={**data.configuration,'campaign_id':id,'created_by':identity[0].id}; p=PromptVersion(agent_type=data.agent_type,version=f'1.{count}.0',prompt_text=data.prompt_text,configuration=config,active=False); db.add(p); audit(db,'PROMPT_CREATED','prompt',p.id); await db.commit(); return out(p)
@router.post('/campaigns/{id}/prompts/{prompt_id}/activate')
async def activate_prompt(id:str,prompt_id:str,db:AsyncSession=Depends(get_session),identity=Depends(require_manager)):
    await draft(id,db); p=await db.get(PromptVersion,prompt_id)
    if not p or p.configuration.get('campaign_id')!=id: raise HTTPException(404,'Campaign prompt not found')
    others=(await db.scalars(select(PromptVersion).where(PromptVersion.agent_type==p.agent_type,PromptVersion.configuration['campaign_id'].as_string()==id))).all()
    for item in others: item.active=item.id==p.id
    audit(db,'PROMPT_ACTIVATED','prompt',p.id); await db.commit(); return out(p)
async def launch_checks(c,db):
    setup=await setup_for(c,db); agents=await db.scalar(select(func.count()).select_from(CampaignAgent).where(CampaignAgent.campaign_id==c.id,CampaignAgent.enabled==True)) or 0; prospects=(await db.scalars(select(CampaignProspect).where(CampaignProspect.campaign_id==c.id))).all(); channels=await db.scalar(select(func.count()).select_from(CampaignChannelSettings).where(CampaignChannelSettings.campaign_id==c.id,CampaignChannelSettings.enabled==True)) or 0; prompts_count=await db.scalar(select(func.count()).select_from(PromptVersion).where(PromptVersion.configuration['campaign_id'].as_string()==c.id,PromptVersion.active==True)) or 0; reps=await db.scalar(select(func.count()).select_from(CampaignAssignment).where(CampaignAssignment.campaign_id==c.id,CampaignAssignment.active==True)) or 0
    conflicts=any((await fit(db,c,await db.get(Prospect,cp.prospect_id)))['suppressed'] or any(x['blocking'] for x in (await fit(db,c,await db.get(Prospect,cp.prospect_id)))['conflicts']) for cp in prospects)
    return [('identity','Campaign identity configured',bool(c.name and setup.owner_id)),('icp','ICP configured',bool(c.target_roles or c.target_industries)),('agents','At least one agent enabled',bool(agents)),('prospects','Prospects sourced and approved',bool(prospects)),('channels','At least one channel enabled',bool(channels)),('prompts','At least one prompt reviewed',bool(prompts_count)),('representative','Representative assigned',bool(reps)),('conflicts','No blocking suppression/conflict state',not conflicts),('draft','Campaign is currently DRAFT',c.status=='DRAFT')]
@router.get('/campaigns/{id}/launch-check')
async def launch_check(id:str,db:AsyncSession=Depends(get_session),identity=Depends(require_manager)):
    c=await campaign(id,db); checks=[{'key':k,'label':l,'passed':p} for k,l,p in await launch_checks(c,db)]; return {'ready':all(x['passed'] for x in checks),'checks':checks}
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
