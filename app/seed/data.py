from sqlalchemy import select
from app.db.models import Campaign, Prospect, CampaignProspect, ResearchFact, Source, KnowledgeDocument, PromptVersion, CampaignAgent
async def seed(db):
  if await db.scalar(select(Campaign.id).limit(1)): return
  campaigns=[Campaign(name='US SaaS CTOs',status='LIVE',target_geography='US',target_industries=['SaaS'],target_roles=['CTO'],instructions='Lead with engineering productivity.',active_channels=['email'],daily_outreach_limit=10),Campaign(name='India BFSI CIOs',status='LIVE',target_geography='India',target_industries=['BFSI'],target_roles=['CIO'],instructions='Lead with compliant automation.',active_channels=['email','sms'],daily_outreach_limit=8),Campaign(name='AI Startup Founders',status='LIVE',target_geography='US',target_industries=['AI'],target_roles=['Founder'],instructions='Lead with rapid GTM experiments.',active_channels=['email','linkedin'],daily_outreach_limit=12)]
  db.add_all(campaigns); await db.flush()
  people=[('Ava','Reed','ava@cloudscale.example','CTO','SaaS','US'),('Rohan','Mehta','rohan@finbridge.example','CIO','BFSI','India'),('Maya','Chen','maya@vectorforge.example','Founder','AI','US'),('Noah','Price','noah@shipfast.example','CTO','SaaS','US'),('Isha','Kapoor','isha@vaultbank.example','CIO','BFSI','India'),('Leo','Park','leo@agentloop.example','Founder','AI','US'),('Nina','Roy','nina@ledger.example','CTO','SaaS','US'),('Arjun','Das','arjun@securepay.example','CIO','BFSI','India'),('Zoe','Kim','zoe@orbitai.example','Founder','AI','US'),('Sam','Cole','sam@streamline.example','CTO','SaaS','US')]
  prospects=[Prospect(first_name=a,last_name=b,email=c,title=d,industry=e,location=f,employee_count=150) for a,b,c,d,e,f in people]; db.add_all(prospects); await db.flush()
  for i,p in enumerate(prospects): db.add(CampaignProspect(campaign_id=campaigns[i%3].id,prospect_id=p.id))
  db.add(CampaignProspect(campaign_id=campaigns[1].id,prospect_id=prospects[0].id,campaign_specific_context={'note':'intentional conflict demo'}))
  source=Source(name='Demo company newsroom',url='https://example.com/news'); db.add(source); await db.flush()
  for p in prospects[:4]: db.add(ResearchFact(prospect_id=p.id,fact=f'{p.first_name}\'s company is hiring GTM and engineering talent.',source_id=source.id,source_url=source.url,confidence=.9))
  docs=[('Product overview','Our platform gives sales teams policy-controlled, multi-channel agent workflows.'),('Sales playbook','Use a specific observed signal, name the outcome, and ask for a small next step.'),('Objection handling','When prospects ask for later, acknowledge timing and schedule a respectful follow-up.'),('Email examples','Keep outreach concise, factual, and grounded in verified research.')]
  db.add_all([KnowledgeDocument(title=t,content=c,category='sales') for t,c in docs]); db.add_all([PromptVersion(agent_type=x,version='1.0.0',prompt_text='Demo structured prompt') for x in ['qualification','strategy','personalization','conversation']]);
  for c in campaigns: db.add(CampaignAgent(campaign_id=c.id,agent_type='outreach',enabled=True))
  await db.commit()
