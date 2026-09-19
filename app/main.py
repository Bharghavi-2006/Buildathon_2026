from contextlib import asynccontextmanager
from datetime import datetime, timedelta
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

@asynccontextmanager
async def lifespan(app):
    await init_db()
    from app.db.session import SessionLocal
    async with SessionLocal() as db: await seed(db)
    yield
app=FastAPI(title='Autonomous SDR Platform',version='0.1.0',lifespan=lifespan)
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
async def health(): return {'status':'healthy','demo_mode':settings().demo_mode,'database':'connected','neo4j':'optional projection'}
@app.get('/campaigns')
async def campaigns(db:AsyncSession=Depends(get_session),identity=Depends(require_manager)): return [dump(x) for x in (await db.scalars(select(Campaign))).all()]
@app.post('/campaigns')
async def create_campaign(data:CampaignIn,db:AsyncSession=Depends(get_session),identity=Depends(require_manager)):
    x=Campaign(**data.model_dump()); db.add(x); await db.commit(); await db.refresh(x); return dump(x)
@app.get('/campaigns/{id}')
async def get_campaign(id:str,db:AsyncSession=Depends(get_session),identity=Depends(require_manager)): return dump(await campaign_or_404(id,db))
@app.patch('/campaigns/{id}')
async def patch_campaign(id:str,data:CampaignIn,db:AsyncSession=Depends(get_session),identity=Depends(require_manager)):
    x=await campaign_or_404(id,db)
    for k,v in data.model_dump().items(): setattr(x,k,v)
    await db.commit(); return dump(x)
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
    await campaign_or_404(id,db); rows=(await db.execute(select(CampaignProspect,Prospect).join(Prospect).where(CampaignProspect.campaign_id==id))).all(); return [{'association':dump(a),'prospect':dump(p)} for a,p in rows]
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
    for cp in cps:
      p=await prospect_or_404(cp.prospect_id,db); facts=(await db.scalars(select(ResearchFact).where(ResearchFact.prospect_id==p.id))).all()
      if stage=='research':
        if not facts: db.add(ResearchFact(prospect_id=p.id,fact=f'{p.first_name} leads {p.title} initiatives in {p.industry}.',source_url='mock://research',confidence=.75))
        p.lifecycle_status='RESEARCHED'; out={'facts':len(facts)+1}
      elif stage=='qualify':
        q=qualify(p,campaign,facts); cp.qualification_status='QUALIFIED' if q.qualified else 'DISQUALIFIED'; cp.qualification_score=q.score; cp.qualification_reason='; '.join(q.reasons); p.lifecycle_status='QUALIFIED' if q.qualified else 'DISQUALIFIED'; out=q.model_dump()
      else:
        q=qualify(p,campaign,facts)
        if not q.qualified: out={'skipped':'not qualified'}
        else:
          s=strategy(p,campaign); k=await SimpleRetriever().retrieve(db,campaign.instructions+' '+p.industry); msg=personalize(p,campaign,facts,k,s.channel); policy=await PolicyEngine().check(db,campaign,p.id,msg.channel)
          out={'qualification':q.model_dump(),'strategy':s.model_dump(),'message':msg.model_dump(),'policy':policy.model_dump()}
          if policy.allowed:
            db.add(OutreachEvent(campaign_id=campaign.id,prospect_id=p.id,channel=msg.channel,status='SENT',content=msg.body)); cp.last_contacted_at=datetime.utcnow(); cp.current_stage='CONTACTED'; p.lifecycle_status='CONTACTED'; db.add(ScheduledAction(action_type='FOLLOW_UP',campaign_id=campaign.id,prospect_id=p.id,channel=msg.channel,scheduled_at=datetime.utcnow()+timedelta(minutes=2 if settings().demo_mode else 2880)))
      ar=AgentRun(campaign_id=campaign.id,prospect_id=p.id,agent_type=stage,status='COMPLETED',output_data=out); db.add(ar); results.append({'prospect_id':p.id,'result':out})
    await db.commit(); return {'campaign_id':campaign_id,'stage':stage,'results':results}
@app.post('/campaigns/{id}/run')
async def full_run(id:str,db:AsyncSession=Depends(get_session),identity=Depends(require_manager)): return await execute(id,'outreach',db)
@app.post('/campaigns/{id}/discover')
async def discover(id:str,db:AsyncSession=Depends(get_session),identity=Depends(require_manager)): return {'campaign_id':id,'status':'Mock discovery available; seed provides deterministic prospects'}
@app.post('/campaigns/{id}/research')
async def research(id:str,db:AsyncSession=Depends(get_session),identity=Depends(require_manager)): return await execute(id,'research',db)
@app.post('/campaigns/{id}/qualify')
async def qualification(id:str,db:AsyncSession=Depends(get_session),identity=Depends(require_manager)): return await execute(id,'qualify',db)
@app.post('/campaigns/{id}/outreach')
async def outreach(id:str,db:AsyncSession=Depends(get_session),identity=Depends(require_manager)): return await execute(id,'outreach',db)
@app.get('/prospects/{id}/conversations')
async def conversations(id:str,db:AsyncSession=Depends(get_session),identity=Depends(require_manager)):
    await prospect_or_404(id,db); return [dump(x) for x in (await db.scalars(select(Conversation).where(Conversation.prospect_id==id))).all()]
@app.post('/webhooks/inbound-message')
async def inbound(data:InboundMessage,db:AsyncSession=Depends(get_session)):
    await prospect_or_404(data.prospect_id,db); c=await db.scalar(select(Conversation).where(Conversation.prospect_id==data.prospect_id,Conversation.campaign_id==data.campaign_id))
    if not c: c=Conversation(prospect_id=data.prospect_id,campaign_id=data.campaign_id); db.add(c); await db.flush()
    db.add(Message(conversation_id=c.id,direction='INBOUND',channel=data.channel,content=data.content)); positive=any(x in data.content.lower() for x in ['meeting','interested','calendar'])
    if positive: c.status='MEETING_INTENT'
    if data.campaign_id: db.add(AgentRun(campaign_id=data.campaign_id,prospect_id=data.prospect_id,agent_type='conversation',output_data={'classification':'MEETING' if positive else 'REPLY'}))
    await db.commit(); return {'conversation_id':c.id,'classification':'MEETING' if positive else 'REPLY'}
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
@app.post('/control/kill-switch')
async def kill_switch(identity=Depends(require_manager)): settings().global_kill_switch=True; return {'global_kill_switch':True,'message':'All outreach is blocked'}
@app.post('/control/kill-switch/reset')
async def reset_kill_switch(identity=Depends(require_manager)): settings().global_kill_switch=False; return {'global_kill_switch':False}

# Manager workspace: team assignment, matching, approvals, and monitoring.
@app.get('/team/representatives')
async def representatives(db: AsyncSession=Depends(get_session), identity=Depends(require_manager)):
    rows=(await db.execute(select(User,AccessProfile).join(AccessProfile).where(AccessProfile.role=='REPRESENTATIVE'))).all(); result=[]
    for user,profile in rows:
        active=await db.scalar(select(func.count()).select_from(LeadAssignment).where(LeadAssignment.representative_id==user.id,LeadAssignment.status=='ASSIGNED')) or 0
        result.append({'user':dump(user),'profile':dump(profile),'active_leads':active,'available_capacity':max(0,profile.max_active_leads-active)})
    return result
@app.post('/team/representatives')
async def create_representative(data:RepresentativeProfileIn, db:AsyncSession=Depends(get_session), identity=Depends(require_manager)):
    if await db.scalar(select(User).where(User.email==data.email.lower())): raise HTTPException(409,'Email already exists')
    user=User(name=data.name,email=data.email.lower()); db.add(user); await db.flush(); profile=AccessProfile(user_id=user.id,role='REPRESENTATIVE',max_active_leads=data.max_active_leads,specialties=data.specialties,regions=data.regions); db.add(profile); await db.commit(); return {'user':dump(user),'profile':dump(profile)}
@app.get('/campaigns/{id}/representative-recommendations')
async def representative_recommendations(id:str,db:AsyncSession=Depends(get_session),identity=Depends(require_manager)):
    campaign=await campaign_or_404(id,db); rows=(await db.execute(select(User,AccessProfile).join(AccessProfile).where(AccessProfile.role=='REPRESENTATIVE',AccessProfile.active==True))).all(); ranked=[]
    terms={*(x.lower() for x in campaign.target_industries),*(x.lower() for x in campaign.target_roles)}
    for user,profile in rows:
        active=await db.scalar(select(func.count()).select_from(LeadAssignment).where(LeadAssignment.representative_id==user.id,LeadAssignment.status=='ASSIGNED')) or 0
        expertise=len(terms & {x.lower() for x in profile.specialties}); region=1 if campaign.target_geography.lower() in {x.lower() for x in profile.regions} else 0; capacity=max(0,profile.max_active_leads-active)
        ranked.append({'representative':dump(user),'score':expertise*50+region*25+min(capacity,25),'reasons':{'specialty_matches':expertise,'region_match':bool(region),'available_capacity':capacity}})
    return sorted(ranked,key=lambda x:x['score'],reverse=True)
@app.post('/campaigns/{id}/representatives')
async def assign_campaign_representative(id:str,data:CampaignAssignmentIn,db:AsyncSession=Depends(get_session),identity=Depends(require_manager)):
    campaign=await campaign_or_404(id,db); rep=await db.get(User,data.representative_id); profile=await db.scalar(select(AccessProfile).where(AccessProfile.user_id==data.representative_id,AccessProfile.role=='REPRESENTATIVE'))
    if not rep or not profile: raise HTTPException(422,'Representative not found')
    existing=await db.scalar(select(CampaignAssignment).where(CampaignAssignment.campaign_id==id,CampaignAssignment.representative_id==rep.id))
    if existing: existing.active=True; assignment=existing
    else: assignment=CampaignAssignment(campaign_id=id,representative_id=rep.id,assigned_by_id=identity[0].id); db.add(assignment)
    db.add(AuditLog(action='CAMPAIGN_ASSIGNED',entity_type='campaign',entity_id=campaign.id,details={'representative_id':rep.id})); await db.commit(); return dump(assignment)
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
    approval=await db.get(ApprovalRequest,id)
    if not approval or approval.status!='PENDING': raise HTTPException(404,'Pending approval not found')
    approval.status='APPROVED' if data.approved else 'REJECTED'; approval.decided_by_id=identity[0].id; approval.decision_note=data.note; db.add(AuditLog(action=approval.status,entity_type='approval',entity_id=id)); await db.commit(); return dump(approval)
@app.post('/approvals/decide-batch')
async def decide_approval_batch(data:BatchApprovalDecisionIn,db:AsyncSession=Depends(get_session),identity=Depends(require_manager)):
    requests=(await db.scalars(select(ApprovalRequest).where(ApprovalRequest.id.in_(data.approval_ids),ApprovalRequest.status=='PENDING'))).all()
    for approval in requests: approval.status='APPROVED' if data.approved else 'REJECTED'; approval.decided_by_id=identity[0].id; approval.decision_note=data.note
    await db.commit(); return {'updated':len(requests),'status':'APPROVED' if data.approved else 'REJECTED'}
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
    for rep in reps:
        ids=(await db.scalars(select(LeadAssignment.campaign_prospect_id).where(LeadAssignment.representative_id==rep['user']['id']))).all(); prospect_ids=(await db.scalars(select(CampaignProspect.prospect_id).where(CampaignProspect.id.in_(ids)))).all() if ids else []
        rep['outreach_sent']=sum(e.status=='SENT' and e.prospect_id in prospect_ids for e in events)
    return reps

# Representative workspace: everything is filtered through lead/campaign assignments.
@app.get('/me')
async def me(identity=Depends(current_identity)): return {'user':dump(identity[0]),'role':identity[1].role,'profile':dump(identity[1])}
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
