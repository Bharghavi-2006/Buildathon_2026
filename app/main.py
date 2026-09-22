from contextlib import asynccontextmanager
from datetime import datetime, timedelta
import re
from fastapi import FastAPI, Depends, HTTPException
from sqlalchemy import select, func, inspect as sa_inspect
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import init_db, get_session
from app.db.models import *
from app.schemas import *
from app.seed.data import seed
from app.policy.engine import PolicyEngine
from app.agents.mock import qualify, strategy, personalize
from app.rag.retriever import SimpleRetriever
from app.core.config import settings
from app.api.auth import current_identity, require_manager
from app.api.manager import router as manager_router
from app.delivery.service import EmailDeliveryService, DeliveryError
from app.dronahq.registry import public_agent_status
from app.hurdles.service import ensure_hurdles
from fastapi.middleware.cors import CORSMiddleware

@asynccontextmanager
async def lifespan(app):
    await init_db()
    from app.db.session import SessionLocal
    async with SessionLocal() as db: await seed(db)
    yield
app=FastAPI(title='Autonomous SDR Platform',version='0.1.0',lifespan=lifespan)
origins = [o.strip() for o in settings().cors_origins.split(',') if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins if origins else ['*'],
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)
app.include_router(manager_router)
def dump(x):
    # Mapper attributes (rather than SQL column names) handle reserved names safely.
    return {attr.key:getattr(x,attr.key) for attr in sa_inspect(x).mapper.column_attrs}
async def campaign_or_404(id,db):
    x=await db.get(Campaign,id)
    if not x: raise HTTPException(404,'Campaign not found')
    return x
async def prospect_or_404(id,db):
    x=await db.get(Prospect,id)
    if not x: raise HTTPException(404,'Prospect not found')
    return x
async def representative_campaign_access(campaign_id, user_id, db):
    assignment=await db.scalar(select(CampaignAssignment).where(CampaignAssignment.campaign_id==campaign_id, CampaignAssignment.representative_id==user_id, CampaignAssignment.active==True))
    if not assignment: raise HTTPException(403,'Campaign is not assigned to this representative')
    return assignment
@app.get('/health')
async def health(): return {'status':'healthy','demo_mode':settings().demo_mode,'database':'connected','neo4j':'optional projection','dronahq_agents':public_agent_status()}
@app.get('/campaigns')
async def campaigns(db:AsyncSession=Depends(get_session),identity=Depends(require_manager)): return [dump(x) for x in (await db.scalars(select(Campaign))).all()]
@app.post('/campaigns')
async def create_campaign(data:CampaignIn,db:AsyncSession=Depends(get_session),identity=Depends(require_manager)):
    if data.demo_recipient_email and not re.fullmatch(r'[^@\s]+@[^@\s]+\.[^@\s]+', data.demo_recipient_email.strip()):
        raise HTTPException(422,'demo_recipient_email must be valid when provided')
    x=Campaign(**data.model_dump()); db.add(x); await db.commit(); await db.refresh(x); return dump(x)
@app.get('/campaigns/{id}')
async def get_campaign(id:str,db:AsyncSession=Depends(get_session),identity=Depends(require_manager)): return dump(await campaign_or_404(id,db))
@app.patch('/campaigns/{id}')
async def patch_campaign(id:str,data:CampaignIn,db:AsyncSession=Depends(get_session),identity=Depends(require_manager)):
    x=await campaign_or_404(id,db)
    if data.demo_recipient_email and not re.fullmatch(r'[^@\s]+@[^@\s]+\.[^@\s]+', data.demo_recipient_email.strip()):
        raise HTTPException(422,'demo_recipient_email must be valid when provided')
    for k,v in data.model_dump().items(): setattr(x,k,v)
    await db.commit(); return dump(x)
@app.get('/campaigns/{id}/representatives')
async def campaign_representatives(id:str,db:AsyncSession=Depends(get_session),identity=Depends(require_manager)):
    await campaign_or_404(id,db)
    rows=(await db.execute(select(CampaignAssignment,User).join(User,CampaignAssignment.representative_id==User.id).where(CampaignAssignment.campaign_id==id,CampaignAssignment.active==True))).all()
    return [{'assignment':dump(a),'user':dump(u)} for a,u in rows]
@app.delete('/campaigns/{id}/representatives/{rep_id}')
async def remove_campaign_representative(id:str,rep_id:str,db:AsyncSession=Depends(get_session),identity=Depends(require_manager)):
    await campaign_or_404(id,db)
    assignment=await db.scalar(select(CampaignAssignment).where(CampaignAssignment.campaign_id==id,CampaignAssignment.representative_id==rep_id))
    if assignment:
        assignment.active=False
        await db.commit()
    return {'status':'removed'}
@app.post('/campaigns/{id}/representatives')
async def assign_campaign_representative(id:str,data:CampaignAssignmentIn,db:AsyncSession=Depends(get_session),identity=Depends(require_manager)):
    campaign=await campaign_or_404(id,db); rep=await db.get(User,data.representative_id); profile=await db.scalar(select(AccessProfile).where(AccessProfile.user_id==data.representative_id,AccessProfile.role=='REPRESENTATIVE'))
    if not rep or not profile: raise HTTPException(422,'Representative not found')
    existing=await db.scalar(select(CampaignAssignment).where(CampaignAssignment.campaign_id==id,CampaignAssignment.representative_id==rep.id))
    if existing: existing.active=True; assignment=existing
    else: assignment=CampaignAssignment(campaign_id=id,representative_id=rep.id,assigned_by_id=identity[0].id); db.add(assignment)
    assignment.daily_send_limit=data.daily_send_limit; assignment.assigned_lead_limit=data.assigned_lead_limit; assignment.working_hours=data.working_hours; assignment.routing_rule=data.routing_rule
    db.add(AuditLog(action='CAMPAIGN_ASSIGNED',entity_type='campaign',entity_id=campaign.id,details={'representative_id':rep.id})); await db.commit(); return dump(assignment)
@app.post('/campaigns/{id}/{action}')
async def lifecycle(id:str,action:str,db:AsyncSession=Depends(get_session),identity=Depends(require_manager)):
    statuses={'pause':'PAUSED','resume':'LIVE','complete':'COMPLETED'}
    if action not in statuses: raise HTTPException(404,'Unknown lifecycle action')
    x=await campaign_or_404(id,db); x.status=statuses[action]; db.add(AuditLog(action=action,entity_type='campaign',entity_id=id)); await db.commit(); return dump(x)
@app.get('/prospects')
async def prospects(db:AsyncSession=Depends(get_session),identity=Depends(require_manager)): return [dump(x) for x in (await db.scalars(select(Prospect))).all()]
@app.post('/prospects')
async def create_prospect(data:ProspectIn,db:AsyncSession=Depends(get_session),identity=Depends(require_manager)):
    x=Prospect(**data.model_dump()); db.add(x); await db.commit(); await db.refresh(x); return dump(x)
@app.get('/prospects/{id}')
async def get_prospect(id:str,db:AsyncSession=Depends(get_session),identity=Depends(require_manager)): return dump(await prospect_or_404(id,db))
@app.get('/campaigns/{id}/prospects')
async def campaign_prospects(id:str,db:AsyncSession=Depends(get_session),identity=Depends(require_manager)):
    await campaign_or_404(id,db); rows=(await db.execute(select(CampaignProspect,Prospect).join(Prospect).where(CampaignProspect.campaign_id==id))).all()
    return [{'association':dump(a),'prospect':dump(p),'conflict':await prospect_conflict(db,p.id,id)} for a,p in rows]
@app.get('/campaigns/{id}/pipeline')
async def campaign_pipeline(id:str,db:AsyncSession=Depends(get_session),identity=Depends(require_manager)):
    """Manager observability view assembled from the source-of-truth records."""
    await campaign_or_404(id,db)
    rows=(await db.execute(select(CampaignProspect,Prospect).join(Prospect).where(CampaignProspect.campaign_id==id))).all()
    result=[]
    for cp, prospect in rows:
        research=await db.scalar(select(ProspectResearch).where(ProspectResearch.campaign_id==id,ProspectResearch.prospect_id==prospect.id).order_by(ProspectResearch.updated_at.desc()))
        fitment=await db.scalar(select(ProspectFitment).where(ProspectFitment.campaign_id==id,ProspectFitment.prospect_id==prospect.id).order_by(ProspectFitment.updated_at.desc()))
        approval=await db.scalar(select(ApprovalRequest).where(ApprovalRequest.campaign_prospect_id==cp.id).order_by(ApprovalRequest.updated_at.desc()))
        delivery=await db.scalar(select(DeliveryRecord).where(DeliveryRecord.campaign_id==id,DeliveryRecord.prospect_id==prospect.id).order_by(DeliveryRecord.created_at.desc()))
        conversation=await db.scalar(select(Conversation).where(Conversation.campaign_id==id,Conversation.prospect_id==prospect.id))
        followup=await db.scalar(select(ScheduledAction).where(ScheduledAction.campaign_id==id,ScheduledAction.prospect_id==prospect.id,ScheduledAction.action_type=='FOLLOW_UP').order_by(ScheduledAction.updated_at.desc()))
        result.append({'prospect':dump(prospect),'stage':cp.current_stage,'discovery':'COMPLETE','research':'COMPLETE' if research else 'PENDING','fitment':dump(fitment) if fitment else None,'approval':approval.status if approval else 'PENDING','delivery':{'status':delivery.status,'mode':delivery.delivery_mode,'intended_recipient':delivery.intended_recipient,'actual_recipient':delivery.actual_recipient} if delivery else None,'conversation':conversation.status if conversation else None,'follow_up':followup.status if followup else None})
    return {'campaign_id':id,'prospects':result}
@app.get('/agents')
async def agents(db:AsyncSession=Depends(get_session),identity=Depends(require_manager)): return [dump(x) for x in (await db.scalars(select(CampaignAgent))).all()]
@app.get('/agents/runs')
async def runs(db:AsyncSession=Depends(get_session),identity=Depends(require_manager)): return [dump(x) for x in (await db.scalars(select(AgentRun).order_by(AgentRun.created_at.desc()))).all()]
@app.get('/agents/runs/{id}')
async def run(id:str,db:AsyncSession=Depends(get_session),identity=Depends(require_manager)):
    x=await db.get(AgentRun,id)
    if not x: raise HTTPException(404,'Agent run not found')
    return dump(x)
async def execute(campaign_id,stage,db):
    campaign=await campaign_or_404(campaign_id,db); cps=(await db.scalars(select(CampaignProspect).where(CampaignProspect.campaign_id==campaign_id))).all(); results=[]
    agent_name={'research':'RESEARCH','qualify':'ICP_FITMENT','outreach':'PERSONALIZATION'}.get(stage,stage.upper())
    controlled_agent=await db.scalar(select(CampaignAgent).where(CampaignAgent.campaign_id==campaign_id, CampaignAgent.agent_type.in_([agent_name,agent_name.lower()])))
    agent_disabled=controlled_agent is not None and not controlled_agent.enabled
    for cp in cps:
      p=await prospect_or_404(cp.prospect_id,db)
      if agent_disabled:
        out={'agent':agent_name,'status':'SKIPPED','reason':'AGENT_DISABLED'}
        db.add(AgentRun(campaign_id=campaign.id,prospect_id=p.id,agent_type=stage,status='SKIPPED',output_data=out)); results.append({'prospect_id':p.id,'result':out}); continue
      research_agent=await db.scalar(select(CampaignAgent).where(CampaignAgent.campaign_id==campaign_id, CampaignAgent.agent_type.in_(['RESEARCH','research'])))
      research_unavailable=research_agent is not None and not research_agent.enabled
      facts=[] if research_unavailable else (await db.scalars(select(ResearchFact).where(ResearchFact.prospect_id==p.id))).all()
      if stage=='research':
        if not facts: db.add(ResearchFact(prospect_id=p.id,fact=f'{p.first_name} leads {p.title} initiatives in {p.industry}.',source_url='mock://research',confidence=.75))
        p.lifecycle_status='RESEARCHED'; out={'facts':len(facts)+1}
      elif stage=='qualify':
        q=qualify(p,campaign,facts); cp.qualification_status='QUALIFIED' if q.qualified else 'DISQUALIFIED'; cp.qualification_score=q.score; cp.qualification_reason='; '.join(q.reasons); p.lifecycle_status='QUALIFIED' if q.qualified else 'DISQUALIFIED'; out=q.model_dump()
      else:
        q=qualify(p,campaign,facts)
        if not q.qualified: out={'skipped':'not qualified'}
        else:
          s=strategy(p,campaign); k=await SimpleRetriever().retrieve(db,campaign.instructions+' '+p.industry,campaign_id=campaign.id); msg=personalize(p,campaign,facts,k,s.channel); policy=await PolicyEngine().check(db,campaign,p.id,msg.channel)
          out={'research':{'agent':'RESEARCH','status':'SKIPPED','reason':'AGENT_DISABLED'} if research_unavailable else {'status':'AVAILABLE'},'qualification':q.model_dump(),'strategy':s.model_dump(),'message':msg.model_dump(),'policy':policy.model_dump()}
          # Generation is never delivery. Every generated outbound message enters
          # the existing approval queue, including demo campaigns.
          if not policy.allowed:
            cp.current_stage='POLICY_BLOCKED'
            db.add(OutreachEvent(campaign_id=campaign.id,prospect_id=p.id,channel=msg.channel,status='BLOCKED',content=msg.body,blocked_reason=policy.reason))
          else:
            assignment=await db.scalar(select(LeadAssignment).where(LeadAssignment.campaign_prospect_id==cp.id, LeadAssignment.status=='ASSIGNED'))
            approval=ApprovalRequest(campaign_id=campaign.id,campaign_prospect_id=cp.id,
                representative_id=assignment.representative_id if assignment else None,
                request_type='OUTREACH', payload={'channel':msg.channel,'subject':msg.subject,'message':msg.body,
                'agent':'PERSONALIZATION','strategy':s.model_dump(),'personalization_facts':msg.personalization_facts})
            db.add(approval); cp.current_stage='PENDING_APPROVAL'; p.lifecycle_status='PENDING_APPROVAL'
      ar=AgentRun(campaign_id=campaign.id,prospect_id=p.id,agent_type=stage,status='COMPLETED',output_data=out); db.add(ar); results.append({'prospect_id':p.id,'result':out})
    await db.commit(); return {'campaign_id':campaign_id,'stage':stage,'results':results}
@app.post('/campaigns/{id}/run')
async def full_run(id:str,db:AsyncSession=Depends(get_session),identity=Depends(require_manager)):
    """Legacy batch entry point; it creates drafts only and cannot deliver."""
    return await execute(id,'outreach',db)
@app.post('/campaigns/{id}/discover')
async def discover(id:str,db:AsyncSession=Depends(get_session),identity=Depends(require_manager)):
    raise HTTPException(410,'Use /api/manager/campaigns/{campaign_id}/prospects/discover for DronaHQ Discovery Agent execution')
@app.post('/campaigns/{id}/research')
async def research(id:str,db:AsyncSession=Depends(get_session),identity=Depends(require_manager)):
    raise HTTPException(410,'Use /api/manager/campaigns/{campaign_id}/prospects/{prospect_id}/research for DronaHQ Research Agent execution')
@app.post('/campaigns/{id}/qualify')
async def qualification(id:str,db:AsyncSession=Depends(get_session),identity=Depends(require_manager)): return await execute(id,'qualify',db)
@app.post('/campaigns/{id}/outreach')
async def outreach(id:str,db:AsyncSession=Depends(get_session),identity=Depends(require_manager)): return await execute(id,'outreach',db)

def approval_view(approval, campaign, prospect=None, cp=None):
    payload=approval.payload or {}
    return {'id':approval.id,'campaign':{'id':campaign.id,'name':campaign.name},'prospect':dump(prospect) if prospect else None,'channel':payload.get('channel','email'),'generated_message':payload.get('message',payload.get('content',payload.get('summary',''))),'priority':payload.get('priority','NORMAL'),'intent':payload.get('intent','OUTREACH'),'agent':payload.get('agent','PERSONALIZATION'),'prompt_version':payload.get('prompt_version'),'source_references':payload.get('source_references',[]),'created_at':approval.created_at,'status':approval.status,'fit_score':cp.qualification_score if cp else None,'fit_reason':cp.qualification_reason if cp else None}

async def prospect_conflict(db, prospect_id, exclude_campaign_id):
    """Same cross-campaign-conflict definition PolicyEngine authoritatively enforces at send
    time: another campaign_prospect row for this prospect, in a different LIVE campaign,
    that has already been contacted there."""
    row=(await db.execute(select(CampaignProspect,Campaign).join(Campaign,CampaignProspect.campaign_id==Campaign.id).where(CampaignProspect.prospect_id==prospect_id,CampaignProspect.campaign_id!=exclude_campaign_id,Campaign.status=='LIVE',CampaignProspect.last_contacted_at.is_not(None)))).first()
    if not row: return None
    cp,other=row
    return {'other_campaign_id':other.id,'other_campaign_name':other.name}

async def apply_approval(approval, actor, db, override=False, edited_content=None):
    campaign=await campaign_or_404(approval.campaign_id,db)
    cp=await db.get(CampaignProspect,approval.campaign_prospect_id) if approval.campaign_prospect_id else None
    if not cp: raise HTTPException(422,'Approval has no campaign prospect')
    prospect=await prospect_or_404(cp.prospect_id,db); payload=dict(approval.payload or {})
    if edited_content is not None: payload['message']=edited_content; approval.payload=payload
    channel=payload.get('channel','email').lower()
    result=await PolicyEngine().check(db,campaign,prospect.id,channel,approval.representative_id,payload.get('agent','PERSONALIZATION'))
    details={'actor':actor.id,'role':'MANAGER' if override else 'REPRESENTATIVE','campaign_id':campaign.id,'prospect_id':prospect.id,'previous_state':approval.status,'policy_rule':result.rule}
    if result.rule=='OUTSIDE_WORKING_HOURS' and result.metadata.get('schedule'):
        approval.status='SCHEDULED'; approval.decided_by_id=actor.id
        db.add(ScheduledAction(action_type='OUTREACH',campaign_id=campaign.id,prospect_id=prospect.id,channel=channel,scheduled_at=datetime.utcnow()+timedelta(hours=1),metadata_={'approval_id':approval.id,'content':payload.get('message','')}))
        db.add(AuditLog(action='APPROVAL_SCHEDULED',entity_type='approval',entity_id=approval.id,details={**details,'new_state':'SCHEDULED'})); await db.commit()
        return {'allowed':True,'scheduled':True,'approval':approval_view(approval,campaign,prospect,cp),'policy':result.model_dump()}
    if not result.allowed:
        db.add(AuditLog(action='APPROVAL_BLOCKED',entity_type='approval',entity_id=approval.id,details={**details,'new_state':'PENDING'})); await db.commit()
        return {'allowed':False,'reason_code':result.rule,'message':result.reason,'approval':approval_view(approval,campaign,prospect,cp)}
    try:
        delivery=await EmailDeliveryService().deliver(
            db, campaign, prospect, channel=channel, body=payload.get('message',''),
            subject=payload.get('subject',''), approval_id=approval.id,
            policy_decision=result.model_dump(), idempotency_key=f'approval:{approval.id}',
        )
    except DeliveryError as exc:
        db.add(AuditLog(action='DELIVERY_BLOCKED',entity_type='approval',entity_id=approval.id,details={**details,'new_state':'PENDING','reason':str(exc)})); await db.commit()
        return {'allowed':False,'reason_code':'DELIVERY_CONFIGURATION','message':str(exc),'approval':approval_view(approval,campaign,prospect,cp)}
    approval.status='SENT'; approval.decided_by_id=actor.id; approval.decision_note='Manager emergency override' if override else 'Approved by representative'
    db.add(OutreachEvent(campaign_id=campaign.id,prospect_id=prospect.id,channel=channel,status='SENT',content=payload.get('message',''))); cp.last_contacted_at=datetime.utcnow(); cp.current_stage='DELIVERED'; prospect.lifecycle_status='CONTACTED'
    db.add(AuditLog(action='MANAGER_APPROVAL_OVERRIDE' if override else ('APPROVAL_EDITED_AND_APPROVED' if edited_content is not None else 'APPROVAL_APPROVED'),entity_type='approval',entity_id=approval.id,details={**details,'new_state':'SENT','delivery_id':delivery.id,'delivery_mode':delivery.delivery_mode,'intended_recipient':delivery.intended_recipient,'actual_recipient':delivery.actual_recipient})); await db.commit()
    return {'allowed':True,'scheduled':False,'approval':approval_view(approval,campaign,prospect,cp),'policy':result.model_dump(),'delivery':{'id':delivery.id,'mode':delivery.delivery_mode,'intended_recipient':delivery.intended_recipient,'actual_recipient':delivery.actual_recipient}}

@app.get('/api/rep/approvals')
async def rep_approvals(db:AsyncSession=Depends(get_session),identity=Depends(current_identity)):
    user,profile=identity
    if profile.role!='REPRESENTATIVE': raise HTTPException(403,'Representative role required')
    rows=(await db.execute(select(ApprovalRequest,Campaign,CampaignProspect,Prospect).join(Campaign,ApprovalRequest.campaign_id==Campaign.id).outerjoin(CampaignProspect,ApprovalRequest.campaign_prospect_id==CampaignProspect.id).outerjoin(Prospect,CampaignProspect.prospect_id==Prospect.id).where(ApprovalRequest.representative_id==user.id))).all()
    return [approval_view(a,c,p,cp) for a,c,cp,p in rows]

async def rep_approval_or_404(id, user_id, db):
    approval=await db.get(ApprovalRequest,id)
    if not approval or approval.representative_id!=user_id: raise HTTPException(404,'Approval not found in your queue')
    if approval.status!='PENDING': raise HTTPException(409,'Approval is not pending')
    return approval

@app.post('/api/rep/approvals/{id}/approve')
async def rep_approve(id:str,db:AsyncSession=Depends(get_session),identity=Depends(current_identity)):
    user,profile=identity
    if profile.role!='REPRESENTATIVE': raise HTTPException(403,'Representative role required')
    return await apply_approval(await rep_approval_or_404(id,user.id,db),user,db)
@app.post('/api/rep/approvals/{id}/edit-approve')
async def rep_edit_approve(id:str,data:ApprovalEditIn,db:AsyncSession=Depends(get_session),identity=Depends(current_identity)):
    user,profile=identity
    if profile.role!='REPRESENTATIVE': raise HTTPException(403,'Representative role required')
    if not data.content.strip(): raise HTTPException(422,'Edited message is required')
    return await apply_approval(await rep_approval_or_404(id,user.id,db),user,db,edited_content=data.content)
@app.post('/api/rep/approvals/{id}/reject')
async def rep_reject(id:str,data:ApprovalRejectIn,db:AsyncSession=Depends(get_session),identity=Depends(current_identity)):
    user,profile=identity
    if profile.role!='REPRESENTATIVE': raise HTTPException(403,'Representative role required')
    if data.reason not in ['WRONG_PERSONA','IRRELEVANT_HOOK','WRONG_INFORMATION','DUPLICATE_ACCOUNT','OTHER']: raise HTTPException(422,'Unsupported rejection reason')
    approval=await rep_approval_or_404(id,user.id,db); approval.status='REJECTED'; approval.decided_by_id=user.id; approval.decision_note=data.reason
    db.add(AuditLog(action='APPROVAL_REJECTED',entity_type='approval',entity_id=id,details={'actor':user.id,'role':'REPRESENTATIVE','campaign_id':approval.campaign_id,'reason':data.reason,'previous_state':'PENDING','new_state':'REJECTED'})); await db.commit(); return {'status':'REJECTED','reason':data.reason}
@app.post('/api/rep/approvals/batch-approve')
async def rep_batch_approve(data:BatchApprovalIn,db:AsyncSession=Depends(get_session),identity=Depends(current_identity)):
    user,profile=identity
    if profile.role!='REPRESENTATIVE': raise HTTPException(403,'Representative role required')
    results=[]
    for id in data.approval_ids:
        try: results.append({'approval_id':id,**await apply_approval(await rep_approval_or_404(id,user.id,db),user,db)})
        except HTTPException as exc: results.append({'approval_id':id,'allowed':False,'reason_code':'NOT_ELIGIBLE','message':exc.detail})
    return {'approved':sum(x.get('allowed') and not x.get('scheduled') for x in results),'blocked':sum(not x.get('allowed') for x in results),'scheduled':sum(x.get('scheduled',False) for x in results),'results':results}
async def approval_context_view(approval,db):
    """Shared audit-trail context for an approval item (rep and manager review both use this):
    which agent/prompt produced it, prospect summary, prior research, the full past
    conversation with this prospect on this campaign (if any), and RAG context available."""
    campaign=await campaign_or_404(approval.campaign_id,db)
    cp=await db.get(CampaignProspect,approval.campaign_prospect_id) if approval.campaign_prospect_id else None
    prospect=await db.get(Prospect,cp.prospect_id) if cp else None
    agent_run_id=(approval.payload or {}).get('agent_run_id')
    agent_run=await db.get(AgentRun,agent_run_id) if agent_run_id else None
    # Prefer the RAG context actually retrieved and persisted at generation time (see
    # generate_drafts in app/api/manager.py); a live re-query is only a fallback for
    # older approvals seeded/created before that persistence existed.
    persisted_rag=(approval.payload or {}).get('rag_context')
    rag_context=persisted_rag if persisted_rag is not None else await SimpleRetriever().retrieve(db,f"{campaign.instructions} {prospect.industry if prospect else ''}",campaign_id=campaign.id)
    company=await db.get(Company,prospect.company_id) if prospect and prospect.company_id else None
    prospect_summary=None
    if prospect:
        prospect_summary=prospect.title or 'Contact'
        if company:
            prospect_summary+=f' at {company.name}'
            if company.employee_count: prospect_summary+=f' ({company.employee_count} FTE)'
        if prospect.industry: prospect_summary+=f'. {prospect.industry}.'
    research=await db.scalar(select(ProspectResearch).where(ProspectResearch.campaign_id==campaign.id,ProspectResearch.prospect_id==prospect.id).order_by(ProspectResearch.updated_at.desc())) if prospect else None
    conversation=await db.scalar(select(Conversation).where(Conversation.campaign_id==campaign.id,Conversation.prospect_id==prospect.id)) if prospect else None
    conversation_history=None
    if conversation:
        msgs=(await db.scalars(select(Message).where(Message.conversation_id==conversation.id).order_by(Message.created_at.asc()))).all()
        conversation_history={'id':conversation.id,'status':conversation.status,'messages':[dump(m) for m in msgs]}
    return {
        'agent':(approval.payload or {}).get('agent','PERSONALIZATION'),
        'prompt_version':(approval.payload or {}).get('prompt_version'),
        'agent_run':{'id':agent_run.id,'status':agent_run.status,'engine_version':(agent_run.output_data or {}).get('engine_version'),'dronahq_execution_id':(agent_run.output_data or {}).get('dronahq_execution_id'),'provider':(agent_run.output_data or {}).get('provider')} if agent_run else None,
        'rag_context':rag_context,
        'prospect_summary':prospect_summary,
        'research_snippet':research.research_summary if research else None,
        'conversation':conversation_history,
    }
@app.get('/api/rep/approvals/{id}/context')
async def rep_approval_context(id:str,db:AsyncSession=Depends(get_session),identity=Depends(current_identity)):
    user,profile=identity
    if profile.role!='REPRESENTATIVE': raise HTTPException(403,'Representative role required')
    approval=await db.get(ApprovalRequest,id)
    if not approval or approval.representative_id!=user.id: raise HTTPException(404,'Approval not found in your queue')
    return await approval_context_view(approval,db)
@app.post('/api/manager/approvals/{id}/approve')
async def manager_override(id:str,db:AsyncSession=Depends(get_session),identity=Depends(require_manager)):
    approval=await db.get(ApprovalRequest,id)
    if not approval or approval.status!='PENDING': raise HTTPException(404,'Pending approval not found')
    return await apply_approval(approval,identity[0],db,override=True)
@app.post('/api/manager/approvals/{id}/edit-approve')
async def manager_edit_approve(id:str,data:ApprovalEditIn,db:AsyncSession=Depends(get_session),identity=Depends(require_manager)):
    approval=await db.get(ApprovalRequest,id)
    if not approval or approval.status!='PENDING': raise HTTPException(404,'Pending approval not found')
    if not data.content.strip(): raise HTTPException(422,'Edited message is required')
    return await apply_approval(approval,identity[0],db,override=True,edited_content=data.content)
@app.post('/api/manager/approvals/{id}/reject')
async def manager_reject(id:str,data:ApprovalRejectIn,db:AsyncSession=Depends(get_session),identity=Depends(require_manager)):
    approval=await db.get(ApprovalRequest,id)
    if not approval or approval.status!='PENDING': raise HTTPException(404,'Pending approval not found')
    if data.reason not in ['WRONG_PERSONA','IRRELEVANT_HOOK','WRONG_INFORMATION','DUPLICATE_ACCOUNT','OTHER']: raise HTTPException(422,'Unsupported rejection reason')
    approval.status='REJECTED'; approval.decided_by_id=identity[0].id; approval.decision_note=data.reason
    db.add(AuditLog(action='APPROVAL_REJECTED',entity_type='approval',entity_id=id,details={'actor':identity[0].id,'role':'MANAGER','campaign_id':approval.campaign_id,'reason':data.reason,'previous_state':'PENDING','new_state':'REJECTED'})); await db.commit(); return {'status':'REJECTED','reason':data.reason}
@app.get('/api/manager/approvals/{id}')
async def manager_approval_detail(id:str,db:AsyncSession=Depends(get_session),identity=Depends(require_manager)):
    approval=await db.get(ApprovalRequest,id)
    if not approval: raise HTTPException(404,'Approval not found')
    campaign=await campaign_or_404(approval.campaign_id,db)
    cp=await db.get(CampaignProspect,approval.campaign_prospect_id) if approval.campaign_prospect_id else None
    prospect=await db.get(Prospect,cp.prospect_id) if cp else None
    return approval_view(approval,campaign,prospect,cp)
@app.get('/api/manager/approvals/{id}/context')
async def manager_approval_context(id:str,db:AsyncSession=Depends(get_session),identity=Depends(require_manager)):
    approval=await db.get(ApprovalRequest,id)
    if not approval: raise HTTPException(404,'Approval not found')
    return await approval_context_view(approval,db)
@app.get('/prospects/{id}/conversations')
async def conversations(id:str,db:AsyncSession=Depends(get_session),identity=Depends(require_manager)):
    await prospect_or_404(id,db); return [dump(x) for x in (await db.scalars(select(Conversation).where(Conversation.prospect_id==id))).all()]
@app.get('/conversations/{id}/messages')
async def conversation_messages(id:str,db:AsyncSession=Depends(get_session),identity=Depends(current_identity)):
    c=await db.get(Conversation,id)
    if not c: raise HTTPException(404,'Conversation not found')
    msgs=(await db.scalars(select(Message).where(Message.conversation_id==id).order_by(Message.created_at.asc()))).all()
    return [dump(m) for m in msgs]
@app.post('/conversations/{id}/messages')
async def send_manual_reply(id:str,data:dict,db:AsyncSession=Depends(get_session),identity=Depends(current_identity)):
    c=await db.get(Conversation,id)
    if not c: raise HTTPException(404,'Conversation not found')
    content=data.get('content','').strip()
    if not content: raise HTTPException(422,'Message content is required')
    channel=data.get('channel','email')
    if not c.campaign_id:
        raise HTTPException(409,'Outbound delivery requires a campaign context')
    campaign=await campaign_or_404(c.campaign_id,db)
    user,profile=identity
    if profile.role=='REPRESENTATIVE': await representative_campaign_access(campaign.id,user.id,db)
    # A manual reply always operates on an already-open conversation (never a cold first
    # touch, which only ever goes through the approval pipeline), so a campaign pause or
    # daily limit — controls on new outreach volume — must not block finishing this thread.
    policy=await PolicyEngine().check_continuation(db,c.prospect_id,channel)
    if not policy.allowed:
        raise HTTPException(409,detail={'code':policy.rule,'message':policy.reason})
    prospect=await prospect_or_404(c.prospect_id,db)
    try:
        delivery=await EmailDeliveryService().deliver(db,campaign,prospect,channel=channel,body=content,
            subject=data.get('subject',''),policy_decision=policy.model_dump(),idempotency_key=f'manual:{c.id}:{datetime.utcnow().isoformat()}')
    except DeliveryError as exc:
        raise HTTPException(409,str(exc)) from exc
    db.add(OutreachEvent(campaign_id=campaign.id,prospect_id=prospect.id,channel=channel,status='SENT',content=content))
    await db.commit()
    return {'delivery_id':delivery.id,'delivery_mode':delivery.delivery_mode,'conversation_id':delivery.conversation_id}
@app.get('/campaigns/{id}/conversations')
async def campaign_conversations(id:str,db:AsyncSession=Depends(get_session),identity=Depends(current_identity)):
    await campaign_or_404(id,db); convs=(await db.scalars(select(Conversation).where(Conversation.campaign_id==id))).all(); res=[]
    for c in convs:
        p=await db.get(Prospect,c.prospect_id)
        last_msg=await db.scalar(select(Message).where(Message.conversation_id==c.id).order_by(Message.created_at.desc()))
        res.append({**dump(c),'prospect':dump(p) if p else None,'last_message':dump(last_msg) if last_msg else None})
    return res
@app.post('/webhooks/inbound-message')
async def inbound(data:InboundMessage,db:AsyncSession=Depends(get_session)):
    await prospect_or_404(data.prospect_id,db); c=await db.scalar(select(Conversation).where(Conversation.prospect_id==data.prospect_id,Conversation.campaign_id==data.campaign_id))
    if not c: c=Conversation(prospect_id=data.prospect_id,campaign_id=data.campaign_id); db.add(c); await db.flush()
    db.add(Message(conversation_id=c.id,direction='INBOUND',channel=data.channel,content=data.content)); positive=any(x in data.content.lower() for x in ['meeting','interested','calendar'])
    if positive: c.status='MEETING_INTENT'
    if data.campaign_id: db.add(AgentRun(campaign_id=data.campaign_id,prospect_id=data.prospect_id,agent_type='conversation',output_data={'classification':'MEETING' if positive else 'REPLY'}))
    await db.commit(); return {'conversation_id':c.id,'classification':'MEETING' if positive else 'REPLY'}
@app.post('/api/demo/conversations/{conversation_id}/reply')
async def inject_demo_reply(conversation_id:str,data:DemoReplyIn,db:AsyncSession=Depends(get_session),identity=Depends(require_manager)):
    """Manager-only safe inbound simulator; it never creates a manager prospect."""
    conversation=await db.get(Conversation,conversation_id)
    if not conversation or not conversation.campaign_id: raise HTTPException(404,'Campaign conversation not found')
    campaign=await campaign_or_404(conversation.campaign_id,db)
    if not campaign.demo_mode: raise HTTPException(409,'Demo reply injection requires campaign demo mode')
    if not data.message.strip(): raise HTTPException(422,'Reply message is required')
    db.add(Message(conversation_id=conversation.id,direction='INBOUND',channel='email',content=data.message.strip(),subject='[DEMO REPLY]'))
    conversation.status='OPEN'
    cp=await db.scalar(select(CampaignProspect).where(CampaignProspect.campaign_id==campaign.id,CampaignProspect.prospect_id==conversation.prospect_id))
    if cp: cp.current_stage='REPLIED'
    db.add(AgentRun(campaign_id=campaign.id,prospect_id=conversation.prospect_id,agent_type='CONVERSATION',status='QUEUED',input_data={'conversation_id':conversation.id,'delivery_mode':'DEMO'},output_data={'next_stage':'CONVERSATION_ANALYSIS'}))
    db.add(AuditLog(action='DEMO_REPLY_INJECTED',entity_type='conversation',entity_id=conversation.id,details={'actor':identity[0].id,'campaign_id':campaign.id,'prospect_id':conversation.prospect_id,'delivery_mode':'DEMO'}))
    await db.commit(); return {'conversation_id':conversation.id,'prospect_id':conversation.prospect_id,'delivery_mode':'DEMO','stage':'REPLIED'}
@app.get('/knowledge')
async def knowledge(db:AsyncSession=Depends(get_session),identity=Depends(require_manager)): return [dump(x) for x in (await db.scalars(select(KnowledgeDocument))).all()]
@app.post('/knowledge')
async def add_knowledge(data:KnowledgeIn,db:AsyncSession=Depends(get_session),identity=Depends(require_manager)):
    x=KnowledgeDocument(**data.model_dump()); db.add(x); await db.commit(); return dump(x)
@app.get('/campaigns/{id}/analytics')
async def analytics(id:str,db:AsyncSession=Depends(get_session),identity=Depends(require_manager)):
    await campaign_or_404(id,db); sent=await db.scalar(select(func.count()).select_from(OutreachEvent).where(OutreachEvent.campaign_id==id,OutreachEvent.status=='SENT')) or 0; qualified=await db.scalar(select(func.count()).select_from(CampaignProspect).where(CampaignProspect.campaign_id==id,CampaignProspect.qualification_status=='QUALIFIED')) or 0
    return {'campaign_id':id,'outreach_sent':sent,'qualified_prospects':qualified,'channel_performance':{'email':sent}}
@app.get('/dashboard/overview')
async def dashboard(db:AsyncSession=Depends(get_session),identity=Depends(require_manager)):
    n=lambda m:select(func.count()).select_from(m)
    return {'active_campaigns':await db.scalar(n(Campaign).where(Campaign.status=='LIVE')),'total_prospects':await db.scalar(n(Prospect)),'outreach_sent':await db.scalar(n(OutreachEvent).where(OutreachEvent.status=='SENT')),'agent_runs':await db.scalar(n(AgentRun)),'follow_ups_pending':await db.scalar(n(ScheduledAction).where(ScheduledAction.status=='PENDING'))}
@app.get('/control/kill-switch')
async def get_kill_switch(): return {'global_kill_switch':settings().global_kill_switch}
@app.post('/control/kill-switch')
async def kill_switch(identity=Depends(require_manager)): settings().global_kill_switch=True; return {'global_kill_switch':True,'message':'All outreach is blocked'}
@app.post('/control/kill-switch/reset')
async def reset_kill_switch(identity=Depends(require_manager)): settings().global_kill_switch=False; return {'global_kill_switch':False}

# Manager workspace: team assignment, matching, approvals, and monitoring.
@app.get('/team/managers')
async def team_managers(db: AsyncSession=Depends(get_session), identity=Depends(require_manager)):
    rows=(await db.execute(select(User,AccessProfile).join(AccessProfile).where(AccessProfile.role=='MANAGER'))).all()
    return [{'user':dump(user),'profile':dump(profile)} for user,profile in rows]
@app.get('/team/representatives')
async def representatives(db: AsyncSession=Depends(get_session), identity=Depends(require_manager)):
    rows=(await db.execute(select(User,AccessProfile).join(AccessProfile).where(AccessProfile.role=='REPRESENTATIVE'))).all(); result=[]
    for user,profile in rows:
        active=await db.scalar(select(func.count()).select_from(LeadAssignment).where(LeadAssignment.representative_id==user.id,LeadAssignment.status=='ASSIGNED')) or 0
        camp_count=await db.scalar(select(func.count()).select_from(CampaignAssignment).where(CampaignAssignment.representative_id==user.id,CampaignAssignment.active==True)) or 0
        result.append({'user':dump(user),'profile':dump(profile),'active_leads':active,'available_capacity':max(0,profile.max_active_leads-active),'active_campaigns_count':camp_count})
    return result
@app.post('/team/representatives')
async def create_representative(data:RepresentativeProfileIn, db:AsyncSession=Depends(get_session), identity=Depends(require_manager)):
    if await db.scalar(select(User).where(User.email==data.email.lower())): raise HTTPException(409,'Email already exists')
    user=User(name=data.name,email=data.email.lower()); db.add(user); await db.flush(); profile=AccessProfile(user_id=user.id,role='REPRESENTATIVE',max_active_leads=data.max_active_leads,specialties=data.specialties,regions=data.regions,supported_channels=data.supported_channels,timezone=data.timezone,working_hours=data.working_hours); db.add(profile); await db.commit(); return {'user':dump(user),'profile':dump(profile)}
@app.get('/team/representatives/{id}')
async def representative_detail(id:str, db:AsyncSession=Depends(get_session), identity=Depends(require_manager)):
    user = await db.get(User, id)
    if not user: raise HTTPException(404, 'Representative not found')
    profile = await db.scalar(select(AccessProfile).where(AccessProfile.user_id==id, AccessProfile.role=='REPRESENTATIVE'))
    if not profile: raise HTTPException(404, 'Representative profile not found')
    active = await db.scalar(select(func.count()).select_from(LeadAssignment).where(LeadAssignment.representative_id==id, LeadAssignment.status=='ASSIGNED')) or 0
    lead_counts_query = await db.execute(
        select(CampaignProspect.campaign_id, func.count())
        .select_from(LeadAssignment)
        .join(CampaignProspect, LeadAssignment.campaign_prospect_id==CampaignProspect.id)
        .where(LeadAssignment.representative_id==id, LeadAssignment.status=='ASSIGNED')
        .group_by(CampaignProspect.campaign_id)
    )
    leads_by_camp = {camp_id: count for camp_id, count in lead_counts_query.all()}
    assignments = (await db.execute(
        select(CampaignAssignment, Campaign)
        .join(Campaign, CampaignAssignment.campaign_id==Campaign.id)
        .where(CampaignAssignment.representative_id==id)
    )).all()
    camp_assignments = []
    for ca, camp in assignments:
        camp_assignments.append({
            'campaign': dump(camp),
            'assignment': dump(ca),
            'assigned_lead_count': leads_by_camp.get(camp.id, 0),
        })
    threshold = datetime.utcnow() - timedelta(hours=settings().approval_aging_threshold_hours)
    pending_approvals = await db.scalar(select(func.count()).select_from(ApprovalRequest).where(ApprovalRequest.representative_id==id, ApprovalRequest.status=='PENDING')) or 0
    aging_approvals = await db.scalar(select(func.count()).select_from(ApprovalRequest).where(ApprovalRequest.representative_id==id, ApprovalRequest.status=='PENDING', ApprovalRequest.created_at < threshold)) or 0
    lead_prospect_ids = (await db.scalars(
        select(CampaignProspect.prospect_id)
        .select_from(LeadAssignment)
        .join(CampaignProspect, LeadAssignment.campaign_prospect_id==CampaignProspect.id)
        .where(LeadAssignment.representative_id==id)
    )).all()
    outreach_sent = 0
    if lead_prospect_ids:
        outreach_sent = await db.scalar(select(func.count()).select_from(OutreachEvent).where(OutreachEvent.prospect_id.in_(lead_prospect_ids), OutreachEvent.status=='SENT')) or 0
    return {
        'user': dump(user),
        'profile': dump(profile),
        'active_leads': active,
        'available_capacity': max(0, profile.max_active_leads - active),
        'outreach_sent': outreach_sent,
        'campaign_assignments': camp_assignments,
        'approvals': {
            'pending_count': pending_approvals,
            'aging_count': aging_approvals,
        }
    }
@app.patch('/team/representatives/{id}')
async def update_representative(id:str, data:dict, db:AsyncSession=Depends(get_session), identity=Depends(require_manager)):
    user = await db.get(User, id)
    if not user: raise HTTPException(404, 'Representative not found')
    profile = await db.scalar(select(AccessProfile).where(AccessProfile.user_id==id, AccessProfile.role=='REPRESENTATIVE'))
    if not profile: raise HTTPException(404, 'Representative profile not found')
    if 'name' in data and str(data['name']).strip(): user.name = str(data['name']).strip()
    if 'max_active_leads' in data: profile.max_active_leads = int(data['max_active_leads'])
    if 'specialties' in data: profile.specialties = data['specialties']
    if 'regions' in data: profile.regions = data['regions']
    if 'supported_channels' in data: profile.supported_channels = data['supported_channels']
    if 'timezone' in data: profile.timezone = data['timezone']
    if 'working_hours' in data: profile.working_hours = data['working_hours']
    if 'active' in data: profile.active = bool(data['active'])
    await db.commit()
    return {'user': dump(user), 'profile': dump(profile)}
@app.get('/campaigns/{id}/representative-recommendations')
async def representative_recommendations(id:str,db:AsyncSession=Depends(get_session),identity=Depends(require_manager)):
    campaign=await campaign_or_404(id,db); rows=(await db.execute(select(User,AccessProfile).join(AccessProfile).where(AccessProfile.role=='REPRESENTATIVE',AccessProfile.active==True))).all(); ranked=[]
    terms={*(x.lower() for x in campaign.target_industries),*(x.lower() for x in campaign.target_roles)}
    for user,profile in rows:
        active=await db.scalar(select(func.count()).select_from(LeadAssignment).where(LeadAssignment.representative_id==user.id,LeadAssignment.status=='ASSIGNED')) or 0
        expertise=len(terms & {x.lower() for x in profile.specialties}); region=1 if campaign.target_geography.lower() in {x.lower() for x in profile.regions} else 0; capacity=max(0,profile.max_active_leads-active)
        ranked.append({'representative':dump(user),'score':expertise*50+region*25+min(capacity,25),'reasons':{'specialty_matches':expertise,'region_match':bool(region),'available_capacity':capacity}})
    return sorted(ranked,key=lambda x:x['score'],reverse=True)
@app.post('/campaigns/{campaign_id}/prospects/{prospect_id}/assign')
async def assign_lead(campaign_id:str,prospect_id:str,data:LeadAssignmentIn,db:AsyncSession=Depends(get_session),identity=Depends(require_manager)):
    await campaign_or_404(campaign_id,db); cp=await db.scalar(select(CampaignProspect).where(CampaignProspect.campaign_id==campaign_id,CampaignProspect.prospect_id==prospect_id)); profile=await db.scalar(select(AccessProfile).where(AccessProfile.user_id==data.representative_id,AccessProfile.role=='REPRESENTATIVE'))
    if not cp or not profile: raise HTTPException(422,'Campaign prospect or representative not found')
    assignment=await db.scalar(select(LeadAssignment).where(LeadAssignment.campaign_prospect_id==cp.id))
    previous=assignment.representative_id if assignment else None
    if assignment: assignment.representative_id=data.representative_id; assignment.assigned_by_id=identity[0].id; assignment.status='ASSIGNED'
    else: assignment=LeadAssignment(campaign_prospect_id=cp.id,representative_id=data.representative_id,assigned_by_id=identity[0].id); db.add(assignment)
    db.add(AuditLog(action='LEAD_REASSIGNED' if previous else 'LEAD_ASSIGNED',entity_type='campaign_prospect',entity_id=cp.id,details={'from':previous,'to':data.representative_id})); await db.commit(); return dump(assignment)
@app.get('/approvals')
async def approvals(db:AsyncSession=Depends(get_session),identity=Depends(require_manager)): return [dump(x) for x in (await db.scalars(select(ApprovalRequest).where(ApprovalRequest.status=='PENDING'))).all()]
@app.post('/approvals/{id}/decision')
async def decide_approval(id:str,data:ApprovalDecisionIn,db:AsyncSession=Depends(get_session),identity=Depends(require_manager)):
    raise HTTPException(410,'Manager normal approval is disabled; use representative approval or the emergency override endpoint')
@app.post('/approvals/decide-batch')
async def decide_approval_batch(data:BatchApprovalDecisionIn,db:AsyncSession=Depends(get_session),identity=Depends(require_manager)):
    raise HTTPException(410,'Manager batch approval is disabled; approvals belong to representatives')
@app.patch('/campaigns/{id}/agents/{agent_type}')
async def configure_agent(id:str,agent_type:str,data:ControlIn,db:AsyncSession=Depends(get_session),identity=Depends(require_manager)):
    await campaign_or_404(id,db); agent=await db.scalar(select(CampaignAgent).where(CampaignAgent.campaign_id==id,CampaignAgent.agent_type==agent_type))
    if not agent: agent=CampaignAgent(campaign_id=id,agent_type=agent_type,enabled=data.enabled); db.add(agent)
    else: agent.enabled=data.enabled
    await db.commit(); return dump(agent)
@app.patch('/campaigns/{id}/channels/{channel}')
async def configure_channel(id:str,channel:str,data:ControlIn,db:AsyncSession=Depends(get_session),identity=Depends(require_manager)):
    await campaign_or_404(id,db); config=await db.scalar(select(ChannelConfiguration).where(ChannelConfiguration.campaign_id==id,ChannelConfiguration.channel==channel))
    if not config: config=ChannelConfiguration(campaign_id=id,channel=channel,enabled=data.enabled); db.add(config)
    else: config.enabled=data.enabled
    await db.commit(); return dump(config)
@app.get('/monitoring/representatives')
async def representative_monitoring(db:AsyncSession=Depends(get_session),identity=Depends(require_manager)):
    reps=await representatives(db,identity); events=(await db.scalars(select(OutreachEvent))).all()
    threshold = datetime.utcnow() - timedelta(hours=settings().approval_aging_threshold_hours)
    for rep in reps:
        ids=(await db.scalars(select(LeadAssignment.campaign_prospect_id).where(LeadAssignment.representative_id==rep['user']['id']))).all(); prospect_ids=(await db.scalars(select(CampaignProspect.prospect_id).where(CampaignProspect.id.in_(ids)))).all() if ids else []
        rep['outreach_sent']=sum(e.status=='SENT' and e.prospect_id in prospect_ids for e in events)
        rep['pending_approvals']=await db.scalar(select(func.count()).select_from(ApprovalRequest).where(ApprovalRequest.representative_id==rep['user']['id'], ApprovalRequest.status=='PENDING')) or 0
        rep['aging_approvals']=await db.scalar(select(func.count()).select_from(ApprovalRequest).where(ApprovalRequest.representative_id==rep['user']['id'], ApprovalRequest.status=='PENDING', ApprovalRequest.created_at < threshold)) or 0
        campaign_ids=(await db.scalars(select(CampaignAssignment.campaign_id).where(CampaignAssignment.representative_id==rep['user']['id'],CampaignAssignment.active==True))).all()
        agent_rows=(await db.scalars(select(CampaignAgent).where(CampaignAgent.campaign_id.in_(campaign_ids)))).all() if campaign_ids else []
        rep['active_agent_types']=sorted({a.agent_type for a in agent_rows if a.enabled})
        rep['paused_agent_types']=sorted({a.agent_type for a in agent_rows if not a.enabled} - set(rep['active_agent_types']))
    return reps

# Demo authentication boundary: a fixed password map around the existing X-User-Email
# RBAC. This is explicitly NOT JWT/OIDC/production auth -- it exists only so a buildathon
# demo has a real login screen instead of a bare identity switcher. Every authorization
# check downstream of login is unchanged: the frontend still sends X-User-Email, and
# current_identity/require_manager still gate every route exactly as before.
DEMO_LOGIN_PASSWORDS = {
    'manager@demo.local': 'manager123',
    'aisha@demo.local': 'aisha123',
    'vikram@demo.local': 'vikram123',
}
@app.post('/auth/demo-login')
async def demo_login(data: DemoLoginIn, db: AsyncSession = Depends(get_session)):
    email = data.email.strip().lower()
    expected_password = DEMO_LOGIN_PASSWORDS.get(email)
    if not expected_password or data.password != expected_password:
        raise HTTPException(401, 'Invalid email or password')
    user = await db.scalar(select(User).where(User.email == email))
    profile = await db.scalar(select(AccessProfile).where(AccessProfile.user_id == user.id, AccessProfile.active == True)) if user else None
    if not user or not profile:
        raise HTTPException(401, 'Invalid email or password')
    return {
        'authenticated': True,
        'user': {
            'email': user.email,
            'name': user.name,
            'role': profile.role.lower(),
            'representative_id': user.id if profile.role == 'REPRESENTATIVE' else None,
        },
    }

# Representative workspace: everything is filtered through lead/campaign assignments.
@app.get('/me')
async def me(identity=Depends(current_identity)): return {'user':dump(identity[0]),'role':identity[1].role,'profile':dump(identity[1])}
@app.get('/api/rep/campaigns/{id}')
async def rep_campaign_detail(id:str,db:AsyncSession=Depends(get_session),identity=Depends(current_identity)):
    """Rep-scoped read model for a single campaign's detail page — everything a rep needs to
    understand a campaign they're assigned to, without the manager-only edit/pause authority."""
    user,profile=identity
    if profile.role!='REPRESENTATIVE': raise HTTPException(403,'Representative role required')
    campaign=await campaign_or_404(id,db)
    assignment=await db.scalar(select(CampaignAssignment).where(CampaignAssignment.campaign_id==id,CampaignAssignment.representative_id==user.id,CampaignAssignment.active==True))
    if not assignment: raise HTTPException(403,'You are not assigned to this campaign')
    setup=await db.scalar(select(CampaignSetup).where(CampaignSetup.campaign_id==id))
    owner=await db.get(User,setup.owner_id) if setup else None
    cps=(await db.scalars(select(CampaignProspect).where(CampaignProspect.campaign_id==id))).all()
    discovered=len(cps)
    researched=sum(1 for cp in cps if cp.current_stage!='DISCOVERED')
    qualified=sum(1 for cp in cps if cp.qualification_status=='QUALIFIED')
    contacted=sum(1 for cp in cps if cp.last_contacted_at is not None)
    conversations=(await db.scalars(select(Conversation).where(Conversation.campaign_id==id))).all()
    conv_ids=[c.id for c in conversations]
    messages=(await db.scalars(select(Message).where(Message.conversation_id.in_(conv_ids)))).all() if conv_ids else []
    engaged=len({m.conversation_id for m in messages if m.direction=='INBOUND'})
    meetings=sum(1 for c in conversations if c.status=='MEETING_INTENT')
    outbound=[m for m in messages if m.direction=='OUTBOUND']; inbound=[m for m in messages if m.direction=='INBOUND']
    channel_counts:dict={}
    for m in outbound: channel_counts[m.channel]=channel_counts.get(m.channel,0)+1
    prompt=await db.scalar(select(PromptVersion).where(PromptVersion.agent_type=='PERSONALIZATION',PromptVersion.configuration['campaign_id'].as_string()==id,PromptVersion.active==True).order_by(PromptVersion.created_at.desc()))
    enabled_agents=[a.agent_type for a in (await db.scalars(select(CampaignAgent).where(CampaignAgent.campaign_id==id,CampaignAgent.enabled==True))).all()]
    assignments=(await db.scalars(select(CampaignAssignment).where(CampaignAssignment.campaign_id==id,CampaignAssignment.active==True))).all()
    team=[]
    for a in assignments:
        rep_user=await db.get(User,a.representative_id)
        lead_count=await db.scalar(select(func.count()).select_from(LeadAssignment).join(CampaignProspect,LeadAssignment.campaign_prospect_id==CampaignProspect.id).where(CampaignProspect.campaign_id==id,LeadAssignment.representative_id==a.representative_id,LeadAssignment.status=='ASSIGNED')) or 0
        team.append({'representative':{'id':rep_user.id,'name':rep_user.name,'email':rep_user.email},'assigned_leads':lead_count,'daily_send_limit':a.daily_send_limit,'is_you':rep_user.id==user.id})
    days_live=max(0,(datetime.utcnow()-campaign.created_at).days)
    return {
        'campaign':dump(campaign),
        'owner_name':owner.name if owner else None,
        'days_live':days_live,
        'funnel':[
            {'stage':'Discovered','count':discovered},
            {'stage':'Researched','count':researched},
            {'stage':'Qualified','count':qualified},
            {'stage':'Contacted','count':contacted},
            {'stage':'Engaged','count':engaged},
            {'stage':'Meeting','count':meetings},
        ],
        'messages_sent':len(outbound),
        'positive_replies':len(inbound),
        'meetings_booked':meetings,
        'channel_breakdown':[{'channel':ch,'count':c} for ch,c in channel_counts.items()],
        'prompt_version':{'version':prompt.version,'description':prompt.prompt_text} if prompt else None,
        'approval_required':campaign.approval_required,
        'enabled_agents':enabled_agents,
        'team':team,
    }
@app.get('/api/rep/workspace')
async def rep_workspace(db:AsyncSession=Depends(get_session),identity=Depends(current_identity)):
    """Single representative-scoped read model for the SDR workspace."""
    user,profile=identity
    if profile.role!='REPRESENTATIVE': raise HTTPException(403,'Representative role required')
    assignments=(await db.scalars(select(CampaignAssignment).where(CampaignAssignment.representative_id==user.id,CampaignAssignment.active==True))).all()
    campaign_ids=[a.campaign_id for a in assignments]
    lead_rows=(await db.execute(select(LeadAssignment,CampaignProspect,Prospect).join(CampaignProspect,LeadAssignment.campaign_prospect_id==CampaignProspect.id).join(Prospect,CampaignProspect.prospect_id==Prospect.id).where(LeadAssignment.representative_id==user.id,LeadAssignment.status=='ASSIGNED'))).all()
    prospect_ids=[p.id for _,_,p in lead_rows]
    approvals=(await db.execute(select(ApprovalRequest,CampaignProspect,Prospect,Campaign).join(CampaignProspect,ApprovalRequest.campaign_prospect_id==CampaignProspect.id).join(Prospect,CampaignProspect.prospect_id==Prospect.id).join(Campaign,ApprovalRequest.campaign_id==Campaign.id).where(ApprovalRequest.representative_id==user.id,ApprovalRequest.status=='PENDING').order_by(ApprovalRequest.created_at.asc()))).all()
    conversations=(await db.execute(select(Conversation,Prospect,Campaign).join(Prospect,Conversation.prospect_id==Prospect.id).join(Campaign,Conversation.campaign_id==Campaign.id).where(Conversation.campaign_id.in_(campaign_ids),Conversation.prospect_id.in_(prospect_ids)))).all() if campaign_ids and prospect_ids else []
    campaign_cards=[]; channel_live={ch:False for ch in ['email','linkedin','message','voice']}
    for assignment in assignments:
        campaign=await db.get(Campaign,assignment.campaign_id)
        assigned=[cp for _,cp,_ in lead_rows if cp.campaign_id==campaign.id]
        open_count=sum(c.status=='OPEN' and c.campaign_id==campaign.id for c,_,_ in conversations)
        channels=(await db.scalars(select(CampaignChannelSettings).where(CampaignChannelSettings.campaign_id==campaign.id))).all()
        channel_list=[{'channel':x.channel,'enabled':x.enabled} for x in channels] or [{'channel':x,'enabled':True} for x in campaign.active_channels]
        if campaign.status=='LIVE':
            for ch in channel_list:
                if ch['enabled']: channel_live[ch['channel']]=True
        has_conflict=False
        for _,cp,p in lead_rows:
            if cp.campaign_id==campaign.id and await prospect_conflict(db,p.id,campaign.id): has_conflict=True; break
        enabled_agents=[a.agent_type for a in (await db.scalars(select(CampaignAgent).where(CampaignAgent.campaign_id==campaign.id,CampaignAgent.enabled==True))).all()]
        campaign_cards.append({'campaign':dump(campaign),'workload':len(assigned),'open_conversations':open_count,'channels':channel_list,'has_conflict':has_conflict,'enabled_agents':enabled_agents})
    used=await db.scalar(select(func.count()).select_from(ApprovalRequest).where(ApprovalRequest.representative_id==user.id,ApprovalRequest.status.in_(['SENT','SCHEDULED']),ApprovalRequest.updated_at>datetime.utcnow()-timedelta(days=1))) or 0
    limit=next((a.daily_send_limit for a in assignments if a.daily_send_limit is not None),25)
    approval_items=[]
    for a,cp,p,c in approvals:
        approval_items.append({'approval':dump(a),'prospect':dump(p),'campaign':dump(c),'association':dump(cp),'conflict':await prospect_conflict(db,p.id,c.id)})
    return {'metrics':{'pending_approvals':len(approvals),'active_conversations':sum(c.status=='OPEN' for c,_,_ in conversations),'meetings_booked':sum(c.status=='MEETING_INTENT' for c,_,_ in conversations),'capacity_used':used,'capacity_limit':limit,'capacity_remaining':max(0,limit-used),'channel_status':[{'channel':ch,'live':live} for ch,live in channel_live.items()]},'campaigns':campaign_cards,'approvals':approval_items,'conversations':[{'conversation':dump(c),'prospect':dump(p),'campaign':dump(camp)} for c,p,camp in conversations]}
@app.get('/me/campaigns')
async def my_campaigns(db:AsyncSession=Depends(get_session),identity=Depends(current_identity)):
    user,profile=identity
    if profile.role=='MANAGER': return [dump(x) for x in (await db.scalars(select(Campaign))).all()]
    ids=(await db.scalars(select(CampaignAssignment.campaign_id).where(CampaignAssignment.representative_id==user.id,CampaignAssignment.active==True))).all(); return [dump(x) for x in (await db.scalars(select(Campaign).where(Campaign.id.in_(ids)))).all()]
@app.get('/me/leads')
async def my_leads(db:AsyncSession=Depends(get_session),identity=Depends(current_identity)):
    user,profile=identity
    if profile.role!='REPRESENTATIVE': raise HTTPException(403,'Representative role required')
    rows=(await db.execute(select(LeadAssignment,CampaignProspect,Prospect).join(CampaignProspect,LeadAssignment.campaign_prospect_id==CampaignProspect.id).join(Prospect,CampaignProspect.prospect_id==Prospect.id).where(LeadAssignment.representative_id==user.id,LeadAssignment.status=='ASSIGNED'))).all()
    return [{'assignment':dump(a),'campaign_prospect':dump(cp),'prospect':dump(p)} for a,cp,p in rows]
@app.get('/me/approvals')
async def my_approvals(db:AsyncSession=Depends(get_session),identity=Depends(current_identity)):
    user,profile=identity
    if profile.role!='REPRESENTATIVE': raise HTTPException(403,'Representative role required')
    return [dump(x) for x in (await db.scalars(select(ApprovalRequest).where(ApprovalRequest.representative_id==user.id,ApprovalRequest.status=='PENDING'))).all()]
@app.get('/me/follow-ups')
async def my_followups(db:AsyncSession=Depends(get_session),identity=Depends(current_identity)):
    user,profile=identity
    if profile.role!='REPRESENTATIVE': raise HTTPException(403,'Representative role required')
    cp_ids=(await db.scalars(select(LeadAssignment.campaign_prospect_id).where(LeadAssignment.representative_id==user.id,LeadAssignment.status=='ASSIGNED'))).all(); prospect_ids=(await db.scalars(select(CampaignProspect.prospect_id).where(CampaignProspect.id.in_(cp_ids)))).all() if cp_ids else []
    return [dump(x) for x in (await db.scalars(select(ScheduledAction).where(ScheduledAction.prospect_id.in_(prospect_ids),ScheduledAction.status=='PENDING'))).all()]
@app.get('/me/performance')
async def my_performance(db:AsyncSession=Depends(get_session),identity=Depends(current_identity)):
    user,profile=identity
    if profile.role!='REPRESENTATIVE': raise HTTPException(403,'Representative role required')
    leads=await my_leads(db,identity); ids={x['prospect']['id'] for x in leads}; sent=await db.scalar(select(func.count()).select_from(OutreachEvent).where(OutreachEvent.prospect_id.in_(ids),OutreachEvent.status=='SENT')) or 0
    return {'representative_id':user.id,'assigned_leads':len(leads),'outreach_sent':sent,'pending_approvals':await db.scalar(select(func.count()).select_from(ApprovalRequest).where(ApprovalRequest.representative_id==user.id,ApprovalRequest.status=='PENDING')) or 0}

# --- AI Hurdles: materialized from real policy blocks, failed agent runs, and aging approvals. ---
async def hurdle_view(h,db):
    prospect=await db.get(Prospect,h.prospect_id) if h.prospect_id else None
    campaign=await db.get(Campaign,h.campaign_id)
    age_h=round((datetime.utcnow()-h.created_at).total_seconds()/3600,1)
    return {'id':h.id,'status':h.status,'category':h.category,'channel':h.channel,'campaign':{'id':campaign.id,'name':campaign.name} if campaign else None,'prospect':dump(prospect) if prospect else None,'reason':h.reason,'recommended_action':h.recommended_action,'agent_type':h.agent_type,'age_hours':age_h,'escalated_to_manager':h.escalated_to_manager,'created_at':h.created_at,'updated_at':h.updated_at}
async def rep_hurdle_or_404(id,user_id,db):
    h=await db.get(Hurdle,id)
    if not h or h.representative_id!=user_id: raise HTTPException(404,'Hurdle not found in your queue')
    return h
@app.get('/api/rep/hurdles')
async def rep_hurdles(db:AsyncSession=Depends(get_session),identity=Depends(current_identity)):
    user,profile=identity
    if profile.role!='REPRESENTATIVE': raise HTTPException(403,'Representative role required')
    await ensure_hurdles(db)
    rows=(await db.scalars(select(Hurdle).where(Hurdle.representative_id==user.id).order_by(Hurdle.created_at.desc()))).all()
    return [await hurdle_view(h,db) for h in rows]
@app.get('/api/rep/hurdles/{id}')
async def rep_hurdle_detail(id:str,db:AsyncSession=Depends(get_session),identity=Depends(current_identity)):
    user,profile=identity
    if profile.role!='REPRESENTATIVE': raise HTTPException(403,'Representative role required')
    h=await rep_hurdle_or_404(id,user.id,db)
    campaign=await campaign_or_404(h.campaign_id,db); prospect=await db.get(Prospect,h.prospect_id) if h.prospect_id else None
    company=await db.get(Company,prospect.company_id) if prospect and prospect.company_id else None
    conversation=await db.scalar(select(Conversation).where(Conversation.campaign_id==h.campaign_id,Conversation.prospect_id==h.prospect_id)) if h.prospect_id else None
    messages=(await db.scalars(select(Message).where(Message.conversation_id==conversation.id).order_by(Message.created_at.desc()).limit(5))).all() if conversation else []
    agent_run=await db.get(AgentRun,h.agent_run_id) if h.agent_run_id else None
    if not agent_run and h.prospect_id: agent_run=await db.scalar(select(AgentRun).where(AgentRun.campaign_id==h.campaign_id,AgentRun.prospect_id==h.prospect_id,AgentRun.agent_type.in_(['PERSONALIZATION','personalization'])).order_by(AgentRun.created_at.desc()))
    rag_context=await SimpleRetriever().retrieve(db,f'{campaign.instructions} {h.reason}',campaign_id=campaign.id)
    week_ago=datetime.utcnow()-timedelta(days=7)
    recurring_count=await db.scalar(select(func.count()).select_from(Hurdle).where(Hurdle.category==h.category,Hurdle.campaign_id==h.campaign_id,Hurdle.created_at>week_ago)) or 0
    already_flagged=bool(await db.scalar(select(KnowledgeGapFlag).where(KnowledgeGapFlag.campaign_id==h.campaign_id,KnowledgeGapFlag.category==h.category,KnowledgeGapFlag.created_at>week_ago)))
    voice=None
    if h.channel=='voice':
        ctx=h.context or {}
        voice={'call_status':ctx.get('call_status'),'transcript':ctx.get('transcript'),'sentiment':(agent_run.output_data or {}).get('sentiment') if agent_run else None,'transfer_status':ctx.get('transfer_status'),'callback_required':ctx.get('callback_required'),'note':'Voice call telemetry is not available from the backend for this hurdle.' if not ctx.get('transcript') else None}
    return {**await hurdle_view(h,db),'organization':dump(company) if company else None,
        'policy_decision':{'rule':h.policy_rule or h.category,'reason':h.reason} if h.source_type=='OUTREACH_EVENT' else None,
        'agent_escalated':{'agent_type':agent_run.agent_type,'agent_run_id':agent_run.id,'status':agent_run.status,'engine_version':(agent_run.output_data or {}).get('engine_version'),'dronahq_execution_id':(agent_run.output_data or {}).get('dronahq_execution_id'),'output':agent_run.output_data} if agent_run else None,
        'conversation':{'id':conversation.id,'status':conversation.status,'messages':[dump(m) for m in reversed(messages)]} if conversation else None,
        'rag_context':rag_context,'voice':voice,
        'recurring':{'count_this_week':recurring_count,'is_recurring':h.category=='MISSING_KNOWLEDGE' and recurring_count>=2,'already_flagged':already_flagged},
        'resolution':{'status':h.status,'resolved_at':h.resolved_at,'resolved_by_id':h.resolved_by_id,'resolution_note':h.resolution_note}}
@app.post('/api/rep/hurdles/{id}/resolve')
async def rep_hurdle_resolve(id:str,data:HurdleResolveIn,db:AsyncSession=Depends(get_session),identity=Depends(current_identity)):
    user,profile=identity
    if profile.role!='REPRESENTATIVE': raise HTTPException(403,'Representative role required')
    h=await rep_hurdle_or_404(id,user.id,db)
    if h.status=='RESOLVED': raise HTTPException(409,'Hurdle is already resolved')
    h.status='RESOLVED'; h.resolved_at=datetime.utcnow(); h.resolved_by_id=user.id; h.resolution_note=data.note
    db.add(AuditLog(action='HURDLE_RESOLVED',entity_type='hurdle',entity_id=h.id,details={'actor':user.id,'role':'REPRESENTATIVE','campaign_id':h.campaign_id,'category':h.category,'note':data.note}))
    await db.commit(); return await hurdle_view(h,db)
@app.post('/api/rep/hurdles/{id}/escalate')
async def rep_hurdle_escalate(id:str,db:AsyncSession=Depends(get_session),identity=Depends(current_identity)):
    user,profile=identity
    if profile.role!='REPRESENTATIVE': raise HTTPException(403,'Representative role required')
    h=await rep_hurdle_or_404(id,user.id,db)
    h.escalated_to_manager=True; h.escalated_at=datetime.utcnow(); h.status='ESCALATED' if h.status!='RESOLVED' else h.status
    db.add(AuditLog(action='HURDLE_ESCALATED_TO_MANAGER',entity_type='hurdle',entity_id=h.id,details={'actor':user.id,'role':'REPRESENTATIVE','campaign_id':h.campaign_id,'category':h.category}))
    await db.commit(); return await hurdle_view(h,db)
@app.post('/api/rep/hurdles/{id}/flag-knowledge-gap')
async def rep_hurdle_flag_knowledge_gap(id:str,db:AsyncSession=Depends(get_session),identity=Depends(current_identity)):
    user,profile=identity
    if profile.role!='REPRESENTATIVE': raise HTTPException(403,'Representative role required')
    h=await rep_hurdle_or_404(id,user.id,db)
    flag=KnowledgeGapFlag(hurdle_id=h.id,campaign_id=h.campaign_id,category=h.category,flagged_by_id=user.id)
    db.add(flag); db.add(AuditLog(action='KNOWLEDGE_GAP_FLAGGED',entity_type='hurdle',entity_id=h.id,details={'actor':user.id,'campaign_id':h.campaign_id,'category':h.category})); await db.commit()
    week_ago=datetime.utcnow()-timedelta(days=7)
    count=await db.scalar(select(func.count()).select_from(Hurdle).where(Hurdle.category==h.category,Hurdle.campaign_id==h.campaign_id,Hurdle.created_at>week_ago)) or 0
    return {'flag_id':flag.id,'category':h.category,'count_this_week':count}
@app.post('/api/rep/hurdles/{id}/knowledge')
async def rep_hurdle_attach_knowledge(id:str,data:HurdleKnowledgeIn,db:AsyncSession=Depends(get_session),identity=Depends(current_identity)):
    """Persists a real KnowledgeDocument via the existing KB table; scoped to the hurdle's campaign."""
    user,profile=identity
    if profile.role!='REPRESENTATIVE': raise HTTPException(403,'Representative role required')
    h=await rep_hurdle_or_404(id,user.id,db)
    await representative_campaign_access(h.campaign_id,user.id,db)
    if not data.title.strip() or not data.content.strip(): raise HTTPException(422,'title and content are required')
    doc=KnowledgeDocument(title=data.title.strip(),content=data.content.strip(),category=f'campaign_{h.campaign_id}')
    db.add(doc); await db.flush()
    db.add(AuditLog(action='KNOWLEDGE_ATTACHED',entity_type='knowledge_document',entity_id=doc.id,details={'actor':user.id,'role':'REPRESENTATIVE','campaign_id':h.campaign_id,'hurdle_id':h.id}))
    await db.commit(); return dump(doc)

# Rep monitoring: a performance read model built entirely from the rep's own approvals,
# conversations, and hurdles — no separate analytics pipeline, same tables the rest of the
# rep workspace already reads.
@app.get('/api/rep/monitoring')
async def rep_monitoring(db:AsyncSession=Depends(get_session),identity=Depends(current_identity)):
    user,profile=identity
    if profile.role!='REPRESENTATIVE': raise HTTPException(403,'Representative role required')
    await ensure_hurdles(db)
    assignments=(await db.scalars(select(CampaignAssignment).where(CampaignAssignment.representative_id==user.id,CampaignAssignment.active==True))).all()
    campaign_ids=[a.campaign_id for a in assignments]
    campaigns={c.id:c for c in ((await db.scalars(select(Campaign).where(Campaign.id.in_(campaign_ids)))).all() if campaign_ids else [])}

    all_approvals=(await db.scalars(select(ApprovalRequest).where(ApprovalRequest.representative_id==user.id))).all()
    decided=[a for a in all_approvals if a.status in ('SENT','REJECTED')]
    turnaround_hours=[(a.updated_at-a.created_at).total_seconds()/3600 for a in decided]
    avg_turnaround=round(sum(turnaround_hours)/len(turnaround_hours),1) if turnaround_hours else 0.0

    today=datetime.utcnow().date()
    cleared_by_day={today-timedelta(days=i):0 for i in range(6,-1,-1)}
    for a in decided:
        d=a.updated_at.date()
        if d in cleared_by_day: cleared_by_day[d]+=1
    approvals_cleared_last_7_days=[{'date':d.isoformat(),'day':d.strftime('%a'),'count':c} for d,c in sorted(cleared_by_day.items())]

    lead_rows=(await db.execute(select(LeadAssignment,CampaignProspect,Prospect).join(CampaignProspect,LeadAssignment.campaign_prospect_id==CampaignProspect.id).join(Prospect,CampaignProspect.prospect_id==Prospect.id).where(LeadAssignment.representative_id==user.id,LeadAssignment.status=='ASSIGNED'))).all()
    prospect_ids=[p.id for _,_,p in lead_rows]
    conversations=(await db.execute(select(Conversation,Prospect,Campaign).join(Prospect,Conversation.prospect_id==Prospect.id).join(Campaign,Conversation.campaign_id==Campaign.id).where(Conversation.campaign_id.in_(campaign_ids),Conversation.prospect_id.in_(prospect_ids)))).all() if campaign_ids and prospect_ids else []
    conv_campaign_id={c.id:camp.id for c,_,camp in conversations}
    conv_ids=list(conv_campaign_id.keys())
    messages=(await db.scalars(select(Message).where(Message.conversation_id.in_(conv_ids)).order_by(Message.created_at.asc()))).all() if conv_ids else []
    msgs_by_conv:dict={}
    for m in messages: msgs_by_conv.setdefault(m.conversation_id,[]).append(m)

    CHANNELS=['email','linkedin','message','voice']
    channel_conv_sent:dict={ch:set() for ch in CHANNELS}
    channel_conv_replied:dict={ch:set() for ch in CHANNELS}
    channel_msg_sent:dict={ch:0 for ch in CHANNELS}
    campaign_response_times:dict={cid:[] for cid in campaign_ids}
    campaign_sent_convs:dict={cid:0 for cid in campaign_ids}
    campaign_response_convs:dict={cid:0 for cid in campaign_ids}
    all_response_times=[]
    for conv_id,msgs in msgs_by_conv.items():
        cid=conv_campaign_id.get(conv_id)
        outbound=[m for m in msgs if m.direction=='OUTBOUND']
        inbound=[m for m in msgs if m.direction=='INBOUND']
        for m in outbound: channel_msg_sent[m.channel]=channel_msg_sent.get(m.channel,0)+1
        outbound_channels={m.channel for m in outbound}
        has_inbound=bool(inbound)
        for ch in outbound_channels:
            if ch in channel_conv_sent:
                channel_conv_sent[ch].add(conv_id)
                if has_inbound: channel_conv_replied[ch].add(conv_id)
        if outbound:
            if cid in campaign_sent_convs: campaign_sent_convs[cid]+=1
            if has_inbound and cid in campaign_response_convs: campaign_response_convs[cid]+=1
        if outbound and inbound:
            first_out=min(m.created_at for m in outbound)
            after=[m.created_at for m in inbound if m.created_at>=first_out]
            if after:
                hrs=(min(after)-first_out).total_seconds()/3600
                all_response_times.append(hrs)
                if cid in campaign_response_times: campaign_response_times[cid].append(hrs)

    total_sent_convs=sum(1 for msgs in msgs_by_conv.values() if any(m.direction=='OUTBOUND' for m in msgs))
    total_response_convs=sum(1 for msgs in msgs_by_conv.values() if any(m.direction=='OUTBOUND' for m in msgs) and any(m.direction=='INBOUND' for m in msgs))
    response_rate_pct=round(100*total_response_convs/total_sent_convs,1) if total_sent_convs else 0.0

    channel_performance=[]
    for ch in CHANNELS:
        sent_msgs=channel_msg_sent.get(ch,0)
        if not sent_msgs: continue
        convs_sent=len(channel_conv_sent[ch]); convs_replied=len(channel_conv_replied[ch])
        channel_performance.append({'channel':ch,'sent':sent_msgs,'response_rate_pct':round(100*convs_replied/convs_sent,1) if convs_sent else 0.0})

    hurdles=(await db.scalars(select(Hurdle).where(Hurdle.representative_id==user.id))).all()
    hurdles_by_campaign:dict={}
    for h in hurdles: hurdles_by_campaign.setdefault(h.campaign_id,[]).append(h)
    resolved_count=sum(1 for h in hurdles if h.status=='RESOLVED')

    campaign_prospect_ids:dict={}
    for _,cp,p in lead_rows: campaign_prospect_ids.setdefault(cp.campaign_id,set()).add(p.id)

    performance_by_campaign=[]
    for cid in campaign_ids:
        camp=campaigns.get(cid)
        if not camp: continue
        camp_decided=[a for a in decided if a.campaign_id==cid]
        sent_convs=campaign_sent_convs.get(cid,0); response_convs=campaign_response_convs.get(cid,0)
        times=campaign_response_times.get(cid,[])
        meetings=sum(1 for c,_,camp2 in conversations if camp2.id==cid and c.status=='MEETING_INTENT')
        cid_prospect_ids=list(campaign_prospect_ids.get(cid,set()))
        outreach_sent=await db.scalar(select(func.count()).select_from(OutreachEvent).where(OutreachEvent.campaign_id==cid,OutreachEvent.prospect_id.in_(cid_prospect_ids),OutreachEvent.status=='SENT')) if cid_prospect_ids else 0
        performance_by_campaign.append({
            'campaign_id':cid,'campaign_name':camp.name,
            'approvals':len(camp_decided),
            'outreach_sent':outreach_sent or 0,
            'response_rate_pct':round(100*response_convs/sent_convs,1) if sent_convs else 0.0,
            'meetings':meetings,
            'escalations':len(hurdles_by_campaign.get(cid,[])),
            'avg_response_hours':round(sum(times)/len(times),1) if times else 0.0,
        })

    async def hurdle_summary(h):
        camp=campaigns.get(h.campaign_id) or await db.get(Campaign,h.campaign_id)
        prospect=await db.get(Prospect,h.prospect_id) if h.prospect_id else None
        return {
            'hurdle_id':h.id,'category':h.category,'status':h.status,
            'campaign_name':camp.name if camp else None,
            'prospect_name':f'{prospect.first_name} {prospect.last_name}'.strip() if prospect else None,
            'reason':h.reason,'age_hours':round((datetime.utcnow()-h.created_at).total_seconds()/3600,1),
        }
    open_hurdles=sorted([h for h in hurdles if h.status!='RESOLVED'],key=lambda h:h.created_at)
    attention_required=[await hurdle_summary(h) for h in open_hurdles[:5]]

    recent_hurdles=sorted(hurdles,key=lambda h:h.created_at,reverse=True)[:10]
    escalation_history=[]
    for h in recent_hurdles:
        camp=campaigns.get(h.campaign_id) or await db.get(Campaign,h.campaign_id)
        prospect=await db.get(Prospect,h.prospect_id) if h.prospect_id else None
        owner=await db.get(User,h.resolved_by_id) if h.resolved_by_id else None
        escalation_history.append({
            'hurdle_id':h.id,'category':h.category,'status':h.status,
            'campaign_name':camp.name if camp else None,
            'prospect_name':f'{prospect.first_name} {prospect.last_name}'.strip() if prospect else None,
            'owner':owner.name if owner else user.name,
            'timestamp':h.resolved_at if h.status=='RESOLVED' and h.resolved_at else h.created_at,
        })

    used=await db.scalar(select(func.count()).select_from(ApprovalRequest).where(ApprovalRequest.representative_id==user.id,ApprovalRequest.status.in_(['SENT','SCHEDULED']),ApprovalRequest.updated_at>datetime.utcnow()-timedelta(days=1))) or 0
    limit=next((a.daily_send_limit for a in assignments if a.daily_send_limit is not None),25)

    return {
        'summary':{
            'avg_approval_turnaround_hours':avg_turnaround,
            'response_rate_pct':response_rate_pct,
            'meetings_booked':sum(c.status=='MEETING_INTENT' for c,_,_ in conversations),
            'escalations':{'resolved':resolved_count,'total':len(hurdles),'pending':len(hurdles)-resolved_count},
        },
        'approvals_cleared_last_7_days':approvals_cleared_last_7_days,
        'daily_capacity':{'used':used,'limit':limit,'pct':round(100*used/limit) if limit else 0},
        'performance_by_campaign':performance_by_campaign,
        'channel_performance':channel_performance,
        'attention_required':attention_required,
        'escalation_history':escalation_history,
    }

# Rep guardrails: read-only projection of campaign config, channel state, working hours, capacity, and conflicts.
# Every figure here is read directly from the same tables PolicyEngine authoritatively checks against.
@app.get('/api/rep/guardrails')
async def rep_guardrails(db:AsyncSession=Depends(get_session),identity=Depends(current_identity)):
    user,profile=identity
    if profile.role!='REPRESENTATIVE': raise HTTPException(403,'Representative role required')
    assignments=(await db.scalars(select(CampaignAssignment).where(CampaignAssignment.representative_id==user.id,CampaignAssignment.active==True))).all()
    now_hour=datetime.utcnow().hour; day_ago=datetime.utcnow()-timedelta(days=1)
    campaign_cards=[]
    for assignment in assignments:
        campaign=await db.get(Campaign,assignment.campaign_id)
        channel_rows=(await db.scalars(select(CampaignChannelSettings).where(CampaignChannelSettings.campaign_id==campaign.id))).all()
        channels=[]
        for row in channel_rows:
            used=await db.scalar(select(func.count()).select_from(OutreachEvent).where(OutreachEvent.campaign_id==campaign.id,OutreachEvent.channel==row.channel,OutreachEvent.status=='SENT',OutreachEvent.created_at>day_ago)) or 0
            hours=row.working_hours or {}; start=hours.get('start'); end=hours.get('end')
            outside_hours=start is not None and end is not None and not (int(start)<=now_hour<int(end))
            if settings().global_kill_switch: availability='BLOCKED_KILL_SWITCH'
            elif campaign.status!='LIVE': availability='BLOCKED_CAMPAIGN_PAUSED'
            elif not row.enabled: availability='PAUSED'
            elif outside_hours: availability='OUTSIDE_WORKING_HOURS'
            elif used>=row.daily_limit: availability='LIMIT_REACHED'
            else: availability='LIVE'
            channels.append({'channel':row.channel,'enabled':row.enabled,'daily_used':used,'daily_limit':row.daily_limit,'working_hours':hours,'approval_required':row.approval_required,'availability':availability})
        agents_enabled=[a.agent_type for a in (await db.scalars(select(CampaignAgent).where(CampaignAgent.campaign_id==campaign.id,CampaignAgent.enabled==True))).all()]
        lead_rows=(await db.execute(select(CampaignProspect,Prospect).join(Prospect,CampaignProspect.prospect_id==Prospect.id).join(LeadAssignment,LeadAssignment.campaign_prospect_id==CampaignProspect.id).where(CampaignProspect.campaign_id==campaign.id,LeadAssignment.representative_id==user.id,LeadAssignment.status=='ASSIGNED'))).all()
        conflicts=[]
        for cp,prospect in lead_rows:
            overlap=(await db.execute(select(CampaignProspect,Campaign).join(Campaign,CampaignProspect.campaign_id==Campaign.id).where(CampaignProspect.prospect_id==prospect.id,CampaignProspect.campaign_id!=campaign.id,Campaign.status=='LIVE',CampaignProspect.last_contacted_at.is_not(None)))).all()
            for other_cp,other_campaign in overlap:
                conflicts.append({'prospect_id':prospect.id,'prospect_name':f'{prospect.first_name} {prospect.last_name}'.strip(),'other_campaign_id':other_campaign.id,'other_campaign_name':other_campaign.name,'message':'Prospect is active in another campaign.'})
        campaign_cards.append({
            'campaign':{'id':campaign.id,'name':campaign.name,'status':campaign.status,'icp_summary':f"{', '.join(campaign.target_roles) or 'Any role'} / {', '.join(campaign.target_industries) or 'Any industry'} / {campaign.target_geography or 'Any geography'}",'daily_outreach_limit':campaign.daily_outreach_limit,'approval_required':campaign.approval_required,'demo_mode':campaign.demo_mode},
            'restrictions':['ICP, prompts, RAG configuration, routing, agents, daily limits, and campaign status are managed by your manager.'],
            'channels':channels,'agents_enabled':agents_enabled,
            'working_hours':assignment.working_hours or {},
            'paused_message':'Campaign paused by manager.' if campaign.status=='PAUSED' else None,
            'conflicts':conflicts,
        })
    used_today=await db.scalar(select(func.count()).select_from(ApprovalRequest).where(ApprovalRequest.representative_id==user.id,ApprovalRequest.status.in_(['SENT','SCHEDULED']),ApprovalRequest.updated_at>day_ago)) or 0
    limit=next((a.daily_send_limit for a in assignments if a.daily_send_limit is not None),25)
    return {
        'kill_switch':{'active':settings().global_kill_switch,'message':'All outbound activity has been stopped platform-wide by an administrator.' if settings().global_kill_switch else None},
        'representative_profile':{'timezone':profile.timezone,'working_hours':profile.working_hours,'supported_channels':profile.supported_channels},
        'daily_capacity':{'used':used_today,'limit':limit,'remaining':max(0,limit-used_today),'exhausted':used_today>=limit,'warning':used_today>=int(limit*0.8) and used_today<limit},
        'campaigns':campaign_cards,
    }
