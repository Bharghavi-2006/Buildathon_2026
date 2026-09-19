from contextlib import asynccontextmanager
from datetime import datetime, timedelta
from fastapi import FastAPI, Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import init_db, get_session
from app.db.models import *
from app.schemas import *
from app.seed.data import seed
from app.policy.engine import PolicyEngine
from app.agents.mock import qualify, strategy, personalize
from app.rag.retriever import SimpleRetriever
from app.core.config import settings

@asynccontextmanager
async def lifespan(app):
    await init_db()
    from app.db.session import SessionLocal
    async with SessionLocal() as db: await seed(db)
    yield
app=FastAPI(title='Autonomous SDR Platform',version='0.1.0',lifespan=lifespan)
def dump(x):
    return {c.name:getattr(x,c.name) for c in x.__table__.columns}
async def campaign_or_404(id,db):
    x=await db.get(Campaign,id)
    if not x: raise HTTPException(404,'Campaign not found')
    return x
async def prospect_or_404(id,db):
    x=await db.get(Prospect,id)
    if not x: raise HTTPException(404,'Prospect not found')
    return x
@app.get('/health')
async def health(): return {'status':'healthy','demo_mode':settings().demo_mode,'database':'connected','neo4j':'optional projection'}
@app.get('/campaigns')
async def campaigns(db:AsyncSession=Depends(get_session)): return [dump(x) for x in (await db.scalars(select(Campaign))).all()]
@app.post('/campaigns')
async def create_campaign(data:CampaignIn,db:AsyncSession=Depends(get_session)):
    x=Campaign(**data.model_dump()); db.add(x); await db.commit(); await db.refresh(x); return dump(x)
@app.get('/campaigns/{id}')
async def get_campaign(id:str,db:AsyncSession=Depends(get_session)): return dump(await campaign_or_404(id,db))
@app.patch('/campaigns/{id}')
async def patch_campaign(id:str,data:CampaignIn,db:AsyncSession=Depends(get_session)):
    x=await campaign_or_404(id,db)
    for k,v in data.model_dump().items(): setattr(x,k,v)
    await db.commit(); return dump(x)
@app.post('/campaigns/{id}/{action}')
async def lifecycle(id:str,action:str,db:AsyncSession=Depends(get_session)):
    statuses={'pause':'PAUSED','resume':'LIVE','complete':'COMPLETED'}
    if action not in statuses: raise HTTPException(404,'Unknown lifecycle action')
    x=await campaign_or_404(id,db); x.status=statuses[action]; db.add(AuditLog(action=action,entity_type='campaign',entity_id=id)); await db.commit(); return dump(x)
@app.get('/prospects')
async def prospects(db:AsyncSession=Depends(get_session)): return [dump(x) for x in (await db.scalars(select(Prospect))).all()]
@app.post('/prospects')
async def create_prospect(data:ProspectIn,db:AsyncSession=Depends(get_session)):
    x=Prospect(**data.model_dump()); db.add(x); await db.commit(); await db.refresh(x); return dump(x)
@app.get('/prospects/{id}')
async def get_prospect(id:str,db:AsyncSession=Depends(get_session)): return dump(await prospect_or_404(id,db))
@app.get('/campaigns/{id}/prospects')
async def campaign_prospects(id:str,db:AsyncSession=Depends(get_session)):
    await campaign_or_404(id,db); rows=(await db.execute(select(CampaignProspect,Prospect).join(Prospect).where(CampaignProspect.campaign_id==id))).all(); return [{'association':dump(a),'prospect':dump(p)} for a,p in rows]
@app.get('/agents')
async def agents(db:AsyncSession=Depends(get_session)): return [dump(x) for x in (await db.scalars(select(CampaignAgent))).all()]
@app.get('/agents/runs')
async def runs(db:AsyncSession=Depends(get_session)): return [dump(x) for x in (await db.scalars(select(AgentRun).order_by(AgentRun.created_at.desc()))).all()]
@app.get('/agents/runs/{id}')
async def run(id:str,db:AsyncSession=Depends(get_session)):
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
async def full_run(id:str,db:AsyncSession=Depends(get_session)): return await execute(id,'outreach',db)
@app.post('/campaigns/{id}/discover')
async def discover(id:str,db:AsyncSession=Depends(get_session)): return {'campaign_id':id,'status':'Mock discovery available; seed provides deterministic prospects'}
@app.post('/campaigns/{id}/research')
async def research(id:str,db:AsyncSession=Depends(get_session)): return await execute(id,'research',db)
@app.post('/campaigns/{id}/qualify')
async def qualification(id:str,db:AsyncSession=Depends(get_session)): return await execute(id,'qualify',db)
@app.post('/campaigns/{id}/outreach')
async def outreach(id:str,db:AsyncSession=Depends(get_session)): return await execute(id,'outreach',db)
@app.get('/prospects/{id}/conversations')
async def conversations(id:str,db:AsyncSession=Depends(get_session)):
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
async def knowledge(db:AsyncSession=Depends(get_session)): return [dump(x) for x in (await db.scalars(select(KnowledgeDocument))).all()]
@app.post('/knowledge')
async def add_knowledge(data:KnowledgeIn,db:AsyncSession=Depends(get_session)):
    x=KnowledgeDocument(**data.model_dump()); db.add(x); await db.commit(); return dump(x)
@app.get('/campaigns/{id}/analytics')
async def analytics(id:str,db:AsyncSession=Depends(get_session)):
    await campaign_or_404(id,db); sent=await db.scalar(select(func.count()).select_from(OutreachEvent).where(OutreachEvent.campaign_id==id,OutreachEvent.status=='SENT')) or 0; qualified=await db.scalar(select(func.count()).select_from(CampaignProspect).where(CampaignProspect.campaign_id==id,CampaignProspect.qualification_status=='QUALIFIED')) or 0
    return {'campaign_id':id,'outreach_sent':sent,'qualified_prospects':qualified,'channel_performance':{'email':sent}}
@app.get('/dashboard/overview')
async def dashboard(db:AsyncSession=Depends(get_session)):
    n=lambda m:select(func.count()).select_from(m)
    return {'active_campaigns':await db.scalar(n(Campaign).where(Campaign.status=='LIVE')),'total_prospects':await db.scalar(n(Prospect)),'outreach_sent':await db.scalar(n(OutreachEvent).where(OutreachEvent.status=='SENT')),'agent_runs':await db.scalar(n(AgentRun)),'follow_ups_pending':await db.scalar(n(ScheduledAction).where(ScheduledAction.status=='PENDING'))}
@app.post('/control/kill-switch')
async def kill_switch(): settings().global_kill_switch=True; return {'global_kill_switch':True,'message':'All outreach is blocked'}
@app.post('/control/kill-switch/reset')
async def reset_kill_switch(): settings().global_kill_switch=False; return {'global_kill_switch':False}
