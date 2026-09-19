from sqlalchemy import select
from app.db.models import Campaign, Prospect, CampaignProspect, ResearchFact, Source, KnowledgeDocument, PromptVersion, CampaignAgent, CampaignChannelSettings, User, AccessProfile, CampaignAssignment, LeadAssignment, ApprovalRequest
async def seed(db):
  # Identity seed is intentionally idempotent so existing demo databases gain RBAC.
  manager=await db.scalar(select(User).where(User.email=='manager@demo.local'))
  if not manager:
    manager=User(name='Demo Manager',email='manager@demo.local'); db.add(manager); await db.flush(); db.add(AccessProfile(user_id=manager.id,role='MANAGER',max_active_leads=0))
  reps=[]
  for name,email,specialties,regions in [('Aisha Rep','aisha@demo.local',['SaaS','AI'],['US']),('Vikram Rep','vikram@demo.local',['BFSI'],['India'])]:
    rep=await db.scalar(select(User).where(User.email==email))
    if not rep:
      rep=User(name=name,email=email); db.add(rep); await db.flush(); db.add(AccessProfile(user_id=rep.id,role='REPRESENTATIVE',max_active_leads=12,specialties=specialties,regions=regions))
    reps.append(rep)
  await db.commit()
  existing_campaigns=(await db.scalars(select(Campaign))).all()
  if existing_campaigns:
    # Upgrade a pre-RBAC local demo database with deterministic work ownership.
    for i,c in enumerate(existing_campaigns):
      # Add the per-campaign controls introduced after the original demo seed.
      for agent_type in ['ICP_FITMENT','RESEARCH','OUTREACH_STRATEGY','PERSONALIZATION','CONVERSATION','FOLLOW_UP','VOICE']:
        if not await db.scalar(select(CampaignAgent).where(CampaignAgent.campaign_id==c.id,CampaignAgent.agent_type==agent_type)):
          db.add(CampaignAgent(campaign_id=c.id,agent_type=agent_type,enabled=not (i==1 and agent_type=='RESEARCH')))
      if not await db.scalar(select(CampaignAssignment).where(CampaignAssignment.campaign_id==c.id)):
        db.add(CampaignAssignment(campaign_id=c.id,representative_id=reps[i%len(reps)].id,assigned_by_id=manager.id))
    cps=(await db.scalars(select(CampaignProspect))).all()
    for i,cp in enumerate(cps):
      assignment=await db.scalar(select(LeadAssignment).where(LeadAssignment.campaign_prospect_id==cp.id))
      if not assignment:
        rep=reps[i%len(reps)]; db.add(LeadAssignment(campaign_prospect_id=cp.id,representative_id=rep.id,assigned_by_id=manager.id)); db.add(ApprovalRequest(campaign_id=cp.campaign_id,campaign_prospect_id=cp.id,representative_id=rep.id,request_type='OUTREACH_DRAFT',payload={'summary':'Review AI-generated outreach before send'}))
    await db.commit(); return
  campaigns=[Campaign(name='US SaaS CTOs',status='LIVE',target_geography='US',target_industries=['SaaS'],target_roles=['CTO'],instructions='Lead with engineering productivity.',active_channels=['email'],daily_outreach_limit=10),Campaign(name='India BFSI CIOs',status='LIVE',target_geography='India',target_industries=['BFSI'],target_roles=['CIO'],instructions='Lead with compliant automation.',active_channels=['email','linkedin'],daily_outreach_limit=8),Campaign(name='AI Startup Founders',status='PAUSED',target_geography='US',target_industries=['AI'],target_roles=['Founder'],instructions='Lead with rapid GTM experiments.',active_channels=['email','linkedin'],daily_outreach_limit=12)]
  db.add_all(campaigns); await db.flush()
  people=[('Ava','Reed','ava@cloudscale.example','CTO','SaaS','US'),('Rohan','Mehta','rohan@finbridge.example','CIO','BFSI','India'),('Maya','Chen','maya@vectorforge.example','Founder','AI','US'),('Noah','Price','noah@shipfast.example','CTO','SaaS','US'),('Isha','Kapoor','isha@vaultbank.example','CIO','BFSI','India'),('Leo','Park','leo@agentloop.example','Founder','AI','US'),('Nina','Roy','nina@ledger.example','CTO','SaaS','US'),('Arjun','Das','arjun@securepay.example','CIO','BFSI','India'),('Zoe','Kim','zoe@orbitai.example','Founder','AI','US'),('Sam','Cole','sam@streamline.example','CTO','SaaS','US')]
  prospects=[Prospect(first_name=a,last_name=b,email=c,title=d,industry=e,location=f,employee_count=150) for a,b,c,d,e,f in people]; db.add_all(prospects); await db.flush()
  for i,p in enumerate(prospects): db.add(CampaignProspect(campaign_id=campaigns[i%3].id,prospect_id=p.id))
  db.add(CampaignProspect(campaign_id=campaigns[1].id,prospect_id=prospects[0].id,campaign_specific_context={'note':'intentional conflict demo'}))
  source=Source(name='Demo company newsroom',url='https://example.com/news'); db.add(source); await db.flush()
  for p in prospects[:4]: db.add(ResearchFact(prospect_id=p.id,fact=f'{p.first_name}\'s company is hiring GTM and engineering talent.',source_id=source.id,source_url=source.url,confidence=.9))
  docs=[('Product overview','Our platform gives sales teams policy-controlled, multi-channel agent workflows.'),('Sales playbook','Use a specific observed signal, name the outcome, and ask for a small next step.'),('Objection handling','When prospects ask for later, acknowledge timing and schedule a respectful follow-up.'),('Email examples','Keep outreach concise, factual, and grounded in verified research.')]
  db.add_all([KnowledgeDocument(title=t,content=c,category='sales') for t,c in docs]); db.add_all([PromptVersion(agent_type=x,version='1.0.0',prompt_text='Demo structured prompt') for x in ['qualification','strategy','personalization','conversation']]);
  for i,c in enumerate(campaigns):
    for agent_type in ['ICP_FITMENT','RESEARCH','OUTREACH_STRATEGY','PERSONALIZATION','CONVERSATION','FOLLOW_UP','VOICE']:
      db.add(CampaignAgent(campaign_id=c.id,agent_type=agent_type,enabled=not (i==1 and agent_type=='RESEARCH')))
    for channel in c.active_channels: db.add(CampaignChannelSettings(campaign_id=c.id,channel=channel,enabled=True))
  await db.flush()
  # Manager assigns campaign ownership and a deliberately reviewable batch to reps.
  for i,c in enumerate(campaigns): db.add(CampaignAssignment(campaign_id=c.id,representative_id=reps[i%len(reps)].id,assigned_by_id=manager.id))
  cps=(await db.scalars(select(CampaignProspect))).all()
  for i,cp in enumerate(cps):
    rep=reps[i%len(reps)]; p=await db.get(Prospect,cp.prospect_id); db.add(LeadAssignment(campaign_prospect_id=cp.id,representative_id=rep.id,assigned_by_id=manager.id)); db.add(ApprovalRequest(campaign_id=cp.campaign_id,campaign_prospect_id=cp.id,representative_id=rep.id,request_type='OUTREACH_DRAFT',payload={'summary':'Review AI-generated outreach before send','channel':'email','message':f'Hi {p.first_name}, I would welcome a short conversation about your GTM workflow.','agent':'PERSONALIZATION','prompt_version':'1.0.0','source_references':[]}))
  await db.commit()
