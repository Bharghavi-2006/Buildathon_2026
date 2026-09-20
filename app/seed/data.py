from datetime import datetime, timedelta
from sqlalchemy import select, delete
from app.db.models import (
    Campaign, Prospect, CampaignProspect, ResearchFact, Source,
    KnowledgeDocument, PromptVersion, CampaignAgent, CampaignChannelSettings,
    User, AccessProfile, CampaignAssignment, LeadAssignment, ApprovalRequest,
    Conversation, Message, AgentRun, OutreachEvent, ProspectResearch, ProspectFitment,
    Company, ProspectBatch
)

async def seed(db):
    # Check if comprehensive seed is already applied
    existing_campaigns = (await db.scalars(select(Campaign))).all()
    if existing_campaigns and len(existing_campaigns) >= 3 and await db.scalar(select(Conversation)):
        return

    # Clear existing demo records if updating seed
    for model in [Message, Conversation, OutreachEvent, AgentRun, ApprovalRequest,
                  LeadAssignment, CampaignAssignment, CampaignChannelSettings, CampaignAgent,
                  ProspectFitment, ProspectResearch, ResearchFact, CampaignProspect,
                  Prospect, Company, Campaign]:
        await db.execute(delete(model))
    await db.commit()

    # 1. Users & Access Profiles
    manager = await db.scalar(select(User).where(User.email == 'manager@demo.local'))
    if not manager:
        manager = User(name='Demo Manager', email='manager@demo.local')
        db.add(manager)
        await db.flush()
        db.add(AccessProfile(user_id=manager.id, role='MANAGER', max_active_leads=0))

    team = [
        ('Aisha Rep', 'aisha@demo.local', 'REPRESENTATIVE', 20, ['SaaS', 'AI', 'Cloud'], ['US', 'Global']),
        ('Vikram Rep', 'vikram@demo.local', 'REPRESENTATIVE', 15, ['BFSI', 'Enterprise'], ['India', 'APAC']),
        ('Alex Mercer', 'alex.mercer@demo.local', 'REPRESENTATIVE', 20, ['SaaS', 'Security'], ['US']),
        ('Maya Patel', 'maya.patel@demo.local', 'REPRESENTATIVE', 15, ['Fintech', 'Payments'], ['India', 'US']),
        ('James O\'Brien', 'james.obrien@demo.local', 'REPRESENTATIVE', 15, ['Enterprise Software'], ['EMEA']),
        ('Sarah Kim', 'sarah.kim@demo.local', 'REPRESENTATIVE', 20, ['AI/ML', 'DevTools'], ['US'])
    ]

    reps = []
    for name, email, role, max_leads, specs, regs in team:
        u = await db.scalar(select(User).where(User.email == email))
        if not u:
            u = User(name=name, email=email)
            db.add(u)
            await db.flush()
            db.add(AccessProfile(user_id=u.id, role=role, max_active_leads=max_leads, specialties=specs, regions=regs, active=True))
        reps.append(u)
    await db.commit()

    # 2. Companies
    companies = [
        Company(name='CloudScale Systems', website='https://cloudscale.example', industry='SaaS', employee_count=250),
        Company(name='FinBridge Technologies', website='https://finbridge.example', industry='BFSI', employee_count=450),
        Company(name='VectorForge AI', website='https://vectorforge.example', industry='AI', employee_count=85),
        Company(name='VaultBank Global', website='https://vaultbank.example', industry='BFSI', employee_count=1200),
        Company(name='OrbitData Labs', website='https://orbitdata.example', industry='AI', employee_count=110),
        Company(name='PaySecure Networks', website='https://paysecure.example', industry='BFSI', employee_count=320)
    ]
    db.add_all(companies)
    await db.flush()

    # 3. Campaigns:
    # Campaign A = LIVE
    # Campaign B = PAUSED (with open conversations)
    # Campaign C = LIVE
    camp_a = Campaign(
        name='US SaaS Enterprise CTOs',
        description='Outbound engagement targeting CTOs and VPs of Engineering at high-growth Series B+ SaaS companies.',
        status='LIVE',
        demo_mode=True,
        target_geography='US',
        target_industries=['SaaS', 'Cloud'],
        target_roles=['CTO', 'VP Engineering'],
        company_size={'min': 50, 'max': 500},
        instructions='Focus on engineering velocity, autonomous outbound workflows, and developer productivity.',
        active_channels=['email', 'linkedin'],
        daily_outreach_limit=25,
        approval_required=True
    )
    camp_b = Campaign(
        name='India BFSI Digital Leaders',
        description='Enterprise outreach to CIOs and Heads of Tech at leading Indian banking and financial institutions.',
        status='PAUSED',
        demo_mode=True,
        target_geography='India',
        target_industries=['BFSI', 'Fintech'],
        target_roles=['CIO', 'Head of Technology'],
        company_size={'min': 100, 'max': 2000},
        instructions='Emphasize enterprise compliance, deterministic policies, data sovereignty, and audit trails.',
        active_channels=['email', 'linkedin'],
        daily_outreach_limit=15,
        approval_required=True
    )
    camp_c = Campaign(
        name='AI Infrastructure Scale-up',
        description='Rapid outreach targeting founders and heads of AI building next-generation multimodal systems.',
        status='LIVE',
        demo_mode=True,
        target_geography='US',
        target_industries=['AI', 'Developer Tools'],
        target_roles=['Founder', 'Head of AI'],
        company_size={'min': 20, 'max': 250},
        instructions='Highlight rapid experimental GTM cycles, API integrations, and low-latency execution.',
        active_channels=['email', 'linkedin', 'message'],
        daily_outreach_limit=20,
        approval_required=False
    )
    db.add_all([camp_a, camp_b, camp_c])
    await db.flush()

    campaigns = [camp_a, camp_b, camp_c]

    # Setup campaign agents and channel settings
    agent_types = ['DISCOVERY', 'ICP_FITMENT', 'RESEARCH', 'OUTREACH_STRATEGY', 'PERSONALIZATION', 'CONVERSATION', 'FOLLOW_UP', 'VOICE']
    for c in campaigns:
        for at in agent_types:
            db.add(CampaignAgent(campaign_id=c.id, agent_type=at, enabled=True))
        for ch in ['email', 'linkedin', 'message', 'voice']:
            enabled = ch in c.active_channels
            db.add(CampaignChannelSettings(campaign_id=c.id, channel=ch, enabled=enabled, daily_limit=c.daily_outreach_limit, approval_required=c.approval_required))
    await db.flush()

    # Assign campaigns to representatives
    # Aisha gets Campaign A and C, Vikram gets Campaign B
    db.add(CampaignAssignment(campaign_id=camp_a.id, representative_id=reps[0].id, assigned_by_id=manager.id))
    db.add(CampaignAssignment(campaign_id=camp_b.id, representative_id=reps[1].id, assigned_by_id=manager.id))
    db.add(CampaignAssignment(campaign_id=camp_c.id, representative_id=reps[0].id, assigned_by_id=manager.id))
    db.add(CampaignAssignment(campaign_id=camp_a.id, representative_id=reps[2].id, assigned_by_id=manager.id))

    # 4. Prospects
    prospect_defs = [
        ('Ava', 'Reed', 'ava.reed@cloudscale.example', '+1-415-555-0101', 'https://linkedin.com/in/avareed', 'CTO', companies[0].id, 'San Francisco, US', 'SaaS', 250, 'https://cloudscale.example', 'CONTACTED'),
        ('Marcus', 'Brody', 'marcus.brody@cloudscale.example', '+1-415-555-0102', 'https://linkedin.com/in/marcusbrody', 'VP Engineering', companies[0].id, 'Austin, US', 'SaaS', 250, 'https://cloudscale.example', 'QUALIFIED'),
        ('Rohan', 'Mehta', 'rohan.mehta@finbridge.example', '+91-22-555-0103', 'https://linkedin.com/in/rohanmehta', 'CIO', companies[1].id, 'Mumbai, India', 'BFSI', 450, 'https://finbridge.example', 'CONTACTED'),
        ('Isha', 'Kapoor', 'isha.kapoor@vaultbank.example', '+91-11-555-0104', 'https://linkedin.com/in/ishakapoor', 'Head of Technology', companies[3].id, 'Delhi, India', 'BFSI', 1200, 'https://vaultbank.example', 'CONTACTED'),
        ('Arjun', 'Das', 'arjun.das@paysecure.example', '+91-80-555-0105', 'https://linkedin.com/in/arjundas', 'CIO', companies[5].id, 'Bengaluru, India', 'BFSI', 320, 'https://paysecure.example', 'RESEARCHED'),
        ('Maya', 'Chen', 'maya.chen@vectorforge.example', '+1-206-555-0106', 'https://linkedin.com/in/mayachen', 'Founder & CEO', companies[2].id, 'Seattle, US', 'AI', 85, 'https://vectorforge.example', 'QUALIFIED'),
        ('Leo', 'Park', 'leo.park@orbitdata.example', '+1-650-555-0107', 'https://linkedin.com/in/leopark', 'Head of AI', companies[4].id, 'Palo Alto, US', 'AI', 110, 'https://orbitdata.example', 'DISCOVERED'),
        ('Zoe', 'Kim', 'zoe.kim@vectorforge.example', '+1-206-555-0108', 'https://linkedin.com/in/zoekim', 'Head of AI', companies[2].id, 'Seattle, US', 'AI', 85, 'https://vectorforge.example', 'DISCOVERED'),
    ]

    prospects = []
    for first, last, email, phone, l_url, title, c_id, loc, ind, count, web, status in prospect_defs:
        p = Prospect(
            first_name=first, last_name=last, email=email, phone=phone,
            linkedin_url=l_url, title=title, company_id=c_id, location=loc,
            industry=ind, employee_count=count, website=web, lifecycle_status=status,
            metadata_={
                'discovery_source': 'APOLLO',
                'source_id': f'apollo-{email.split("@")[0]}',
                'company_name': next(c.name for c in companies if c.id == c_id)
            }
        )
        db.add(p)
        prospects.append(p)
    await db.flush()

    # 5. Campaign Prospects & Lead Assignments
    # Link to Campaign A: Ava Reed, Marcus Brody
    cp_a1 = CampaignProspect(campaign_id=camp_a.id, prospect_id=prospects[0].id, qualification_status='QUALIFIED', qualification_score=92.0, qualification_reason='Role & SaaS match; Series B verified', current_stage='CONTACTED', last_contacted_at=datetime.utcnow() - timedelta(hours=6))
    cp_a2 = CampaignProspect(campaign_id=camp_a.id, prospect_id=prospects[1].id, qualification_status='QUALIFIED', qualification_score=88.0, qualification_reason='VP Eng title match; engineering headcount > 50', current_stage='QUALIFIED')
    # Link to Campaign B (PAUSED with open conversations): Rohan Mehta, Isha Kapoor, Arjun Das
    cp_b1 = CampaignProspect(campaign_id=camp_b.id, prospect_id=prospects[2].id, qualification_status='QUALIFIED', qualification_score=90.0, qualification_reason='CIO role match; BFSI compliance fit', current_stage='CONTACTED', last_contacted_at=datetime.utcnow() - timedelta(hours=14))
    cp_b2 = CampaignProspect(campaign_id=camp_b.id, prospect_id=prospects[3].id, qualification_status='QUALIFIED', qualification_score=85.0, qualification_reason='Head of Tech at Tier 1 Bank', current_stage='CONTACTED', last_contacted_at=datetime.utcnow() - timedelta(hours=28))
    cp_b3 = CampaignProspect(campaign_id=camp_b.id, prospect_id=prospects[4].id, qualification_status='PENDING', qualification_score=75.0, qualification_reason='Research completed; awaiting review', current_stage='RESEARCHED')
    # Link to Campaign C: Maya Chen, Leo Park, Zoe Kim
    cp_c1 = CampaignProspect(campaign_id=camp_c.id, prospect_id=prospects[5].id, qualification_status='QUALIFIED', qualification_score=95.0, qualification_reason='AI founder; high growth signal', current_stage='QUALIFIED')
    cp_c2 = CampaignProspect(campaign_id=camp_c.id, prospect_id=prospects[6].id, qualification_status='PENDING', qualification_score=80.0, qualification_reason='Head of AI title match', current_stage='DISCOVERED')
    cp_c3 = CampaignProspect(campaign_id=camp_c.id, prospect_id=prospects[7].id, qualification_status='PENDING', qualification_score=82.0, qualification_reason='Head of AI title match', current_stage='DISCOVERED')

    cps = [cp_a1, cp_a2, cp_b1, cp_b2, cp_b3, cp_c1, cp_c2, cp_c3]
    db.add_all(cps)
    await db.flush()

    # Assign leads: Aisha handles Camp A & C leads, Vikram handles Camp B leads
    db.add(LeadAssignment(campaign_prospect_id=cp_a1.id, representative_id=reps[0].id, assigned_by_id=manager.id, status='ASSIGNED'))
    db.add(LeadAssignment(campaign_prospect_id=cp_a2.id, representative_id=reps[0].id, assigned_by_id=manager.id, status='ASSIGNED'))
    db.add(LeadAssignment(campaign_prospect_id=cp_b1.id, representative_id=reps[1].id, assigned_by_id=manager.id, status='ASSIGNED'))
    db.add(LeadAssignment(campaign_prospect_id=cp_b2.id, representative_id=reps[1].id, assigned_by_id=manager.id, status='ASSIGNED'))
    db.add(LeadAssignment(campaign_prospect_id=cp_b3.id, representative_id=reps[1].id, assigned_by_id=manager.id, status='ASSIGNED'))
    db.add(LeadAssignment(campaign_prospect_id=cp_c1.id, representative_id=reps[0].id, assigned_by_id=manager.id, status='ASSIGNED'))
    db.add(LeadAssignment(campaign_prospect_id=cp_c2.id, representative_id=reps[0].id, assigned_by_id=manager.id, status='ASSIGNED'))
    db.add(LeadAssignment(campaign_prospect_id=cp_c3.id, representative_id=reps[0].id, assigned_by_id=manager.id, status='ASSIGNED'))
    db.add(CampaignAssignment(campaign_id=camp_a.id, representative_id=reps[0].id, assigned_by_id=manager.id, daily_send_limit=25, active=True))
    db.add(CampaignAssignment(campaign_id=camp_c.id, representative_id=reps[0].id, assigned_by_id=manager.id, daily_send_limit=25, active=True))
    db.add(CampaignAssignment(campaign_id=camp_b.id, representative_id=reps[1].id, assigned_by_id=manager.id, daily_send_limit=20, active=True))
    await db.flush()

    # 6. OPEN CONVERSATIONS for Campaign B (as specifically required by Prompt)
    # Rohan Mehta conversation (OPEN)
    conv_b1 = Conversation(campaign_id=camp_b.id, prospect_id=prospects[2].id, status='OPEN')
    db.add(conv_b1)
    await db.flush()
    db.add(Message(conversation_id=conv_b1.id, direction='OUTBOUND', channel='email', subject='Compliant automated verification at FinBridge', content=f'Hi {prospects[2].first_name}, I noticed FinBridge\'s recent expansion in compliant payment gateways. Would love to share how our SDR platform enables automated policy compliance.'))
    db.add(Message(conversation_id=conv_b1.id, direction='INBOUND', channel='email', subject='Re: Compliant automated verification at FinBridge', content='Thanks for reaching out. We are currently evaluating automated verification workflows. Can you share your SOC2 Type II certification details?'))

    # Isha Kapoor conversation (OPEN)
    conv_b2 = Conversation(campaign_id=camp_b.id, prospect_id=prospects[3].id, status='OPEN')
    db.add(conv_b2)
    await db.flush()
    db.add(Message(conversation_id=conv_b2.id, direction='OUTBOUND', channel='linkedin', subject='Core banking infrastructure modernisation', content=f'Hello {prospects[3].first_name}, following up on your digital banking infrastructure initiatives at VaultBank.'))
    db.add(Message(conversation_id=conv_b2.id, direction='INBOUND', channel='linkedin', subject='', content='Interesting timing, we are reviewing our Q4 integration architecture. What does your policy governance engine look like?'))

    # Ava Reed conversation in Campaign A (MEETING_INTENT)
    conv_a1 = Conversation(campaign_id=camp_a.id, prospect_id=prospects[0].id, status='MEETING_INTENT')
    db.add(conv_a1)
    await db.flush()
    db.add(Message(conversation_id=conv_a1.id, direction='OUTBOUND', channel='email', subject='Engineering productivity workflows', content=f'Hi {prospects[0].first_name}, saw CloudScale\'s engineering team growth. We help scale outbound pipelines without burdening your leads.'))
    db.add(Message(conversation_id=conv_a1.id, direction='INBOUND', channel='email', subject='Re: Engineering productivity workflows', content='This looks very relevant for our upcoming hiring cycle. Can we schedule a 15-minute introductory meeting this Thursday at 2pm PST?'))

    # 7. Research Records
    # Ava Reed
    res_a = ProspectResearch(
        campaign_id=camp_a.id,
        prospect_id=prospects[0].id,
        status='verified',
        research_summary='Verified CTO at CloudScale Systems. Company recently raised $32M Series B, scaling distributed engineering teams from 120 to 250 engineers.',
        person_research={'current_role': 'CTO', 'tenure': '2 years 4 months', 'prior_companies': ['Stripe', 'Twilio'], 'education': 'Stanford CS'},
        company_research={'company_name': 'CloudScale Systems', 'industry': 'B2B SaaS', 'employee_count': 250, 'revenue_estimate': '$18M ARR', 'funding': '$32M Series B'},
        icp_evidence=[
            {'criterion': 'Role Match', 'status': 'MATCHED', 'evidence': 'Title is Chief Technology Officer', 'source': 'LinkedIn / Company Bio'},
            {'criterion': 'Industry Match', 'status': 'MATCHED', 'evidence': 'B2B Cloud & Enterprise SaaS provider', 'source': 'Company Website'},
            {'criterion': 'Company Size', 'status': 'MATCHED', 'evidence': '250 employees confirmed via LinkedIn insights', 'source': 'Apollo'}
        ],
        business_context=['Migrating monolithic workflows to event-driven microservices', 'Hiring 40+ fullstack and platform engineers in H2'],
        personalization_signals=['Keynote speaker at CloudNative Con 2025 on automated policy governance', 'Authored technical blog post on developer ergonomics'],
        sources=['https://cloudscale.example/about', 'https://linkedin.com/in/avareed', 'https://techcrunch.example/cloudscale-series-b'],
        uncertainties=[],
        agent_run_id='seed-run-1'
    )
    # Rohan Mehta
    res_b = ProspectResearch(
        campaign_id=camp_b.id,
        prospect_id=prospects[2].id,
        status='verified',
        research_summary='Chief Information Officer at FinBridge Technologies. Oversees digital banking architecture, security policies, and vendor risk management.',
        person_research={'current_role': 'CIO', 'tenure': '3 years', 'certifications': ['CISSP', 'CISM']},
        company_research={'company_name': 'FinBridge Technologies', 'industry': 'BFSI / Fintech', 'employee_count': 450, 'licensing': 'RBI regulated payment aggregator'},
        icp_evidence=[
            {'criterion': 'Role Match', 'status': 'MATCHED', 'evidence': 'Current CIO reporting to Managing Director', 'source': 'Company Leadership Page'},
            {'criterion': 'Geography', 'status': 'MATCHED', 'evidence': 'Headquartered in Mumbai, Maharashtra', 'source': 'MCA Filings'},
            {'criterion': 'Industry Match', 'status': 'MATCHED', 'evidence': 'Regulated BFSI & payment processing', 'source': 'Annual Report'}
        ],
        business_context=['Currently upgrading enterprise compliance audit logging', 'Modernising legacy core banking middleware'],
        personalization_signals=['Spoke on RBI compliance guidelines at BFSI Summit 2025'],
        sources=['https://finbridge.example/leadership', 'https://linkedin.com/in/rohanmehta'],
        uncertainties=['Exact vendor budget allocation for Q4 unconfirmed'],
        agent_run_id='seed-run-2'
    )
    db.add_all([res_a, res_b])
    await db.flush()

    # 8. Deterministic ICP Fitments
    fit_a = ProspectFitment(
        campaign_id=camp_a.id,
        prospect_id=prospects[0].id,
        organization_fit_score=95.0,
        organization_fit_status='STRONG_FIT',
        organization_criteria=[
            {'criterion': 'industry', 'status': 'MATCHED', 'expected_value': ['SaaS', 'Cloud'], 'actual_value': 'B2B SaaS', 'reason': 'Industry matches campaign ICP.'},
            {'criterion': 'geography', 'status': 'MATCHED', 'expected_value': 'US', 'actual_value': 'San Francisco, US', 'reason': 'Location is inside target territory.'},
            {'criterion': 'company_size', 'status': 'MATCHED', 'expected_value': '50-500 employees', 'actual_value': 250, 'reason': 'Employee count (250) falls squarely within 50-500 range.'}
        ],
        contact_fit_score=90.0,
        contact_fit_status='STRONG_FIT',
        contact_criteria=[
            {'criterion': 'target_role', 'status': 'MATCHED', 'expected_value': ['CTO', 'VP Engineering'], 'actual_value': 'CTO', 'reason': 'Current role is verified CTO.'}
        ],
        overall_fit_score=92.5,
        overall_fit_status='STRONG_FIT',
        recommended_next_stage='OUTREACH_ELIGIBLE',
        key_fit_signals=['Target title CTO directly matches ICP', 'Rapid engineering team growth signal', 'Confirmed Series B funding'],
        key_risk_factors=[],
        uncertainties=[],
        research_id=res_a.id,
        engine_version='icp-fitment-v1'
    )
    fit_b = ProspectFitment(
        campaign_id=camp_b.id,
        prospect_id=prospects[2].id,
        organization_fit_score=90.0,
        organization_fit_status='STRONG_FIT',
        organization_criteria=[
            {'criterion': 'industry', 'status': 'MATCHED', 'expected_value': ['BFSI', 'Fintech'], 'actual_value': 'BFSI / Fintech', 'reason': 'Industry matches campaign ICP.'},
            {'criterion': 'geography', 'status': 'MATCHED', 'expected_value': 'India', 'actual_value': 'Mumbai, India', 'reason': 'Headquarters located in India.'},
            {'criterion': 'company_size', 'status': 'MATCHED', 'expected_value': '100-2000 employees', 'actual_value': 450, 'reason': 'Employee count within target bounds.'}
        ],
        contact_fit_score=85.0,
        contact_fit_status='STRONG_FIT',
        contact_criteria=[
            {'criterion': 'target_role', 'status': 'MATCHED', 'expected_value': ['CIO', 'Head of Technology'], 'actual_value': 'CIO', 'reason': 'Title is Chief Information Officer.'}
        ],
        overall_fit_score=87.5,
        overall_fit_status='STRONG_FIT',
        recommended_next_stage='OUTREACH_ELIGIBLE',
        key_fit_signals=['Regulated BFSI compliance match', 'High authority budget owner'],
        key_risk_factors=['Longer enterprise procurement cycle typical of banking'],
        uncertainties=['Internal procurement sign-off required'],
        research_id=res_b.id,
        engine_version='icp-fitment-v1'
    )
    db.add_all([fit_a, fit_b])
    await db.flush()

    # 9. Approval Requests (Including an aging approval > 24 hours old so alert banner triggers!)
    aging_created_at = datetime.utcnow() - timedelta(hours=28)
    normal_created_at = datetime.utcnow() - timedelta(hours=3)

    # Aging approval assigned to Alex Mercer / Aisha
    app_aging = ApprovalRequest(
        campaign_id=camp_a.id,
        campaign_prospect_id=cp_a2.id,
        representative_id=reps[2].id, # Alex Mercer
        request_type='OUTREACH_DRAFT',
        payload={
            'summary': 'Draft engineering velocity pitch for Marcus Brody',
            'channel': 'email',
            'priority': 'HIGH',
            'intent': 'OUTREACH',
            'agent': 'PERSONALIZATION',
            'prompt_version': '1.0.0',
            'message': 'Hi Marcus, CloudScale\'s engineering expansion caught my eye. We provide automated policy-governed outbound agents to keep GTM aligned without pulling engineers into pipeline ops. Open to a 10-minute demo next Tuesday?',
            'source_references': ['https://cloudscale.example/careers', 'LinkedIn Headcount Insights']
        },
        status='PENDING'
    )
    app_aging.created_at = aging_created_at

    # Normal pending approval assigned to Aisha
    app_normal1 = ApprovalRequest(
        campaign_id=camp_c.id,
        campaign_prospect_id=cp_c1.id,
        representative_id=reps[0].id, # Aisha
        request_type='OUTREACH_DRAFT',
        payload={
            'summary': 'AI infrastructure scalability outreach for Maya Chen',
            'channel': 'email',
            'priority': 'NORMAL',
            'intent': 'OUTREACH',
            'agent': 'PERSONALIZATION',
            'prompt_version': '1.0.0',
            'message': 'Hi Maya, love VectorForge\'s multimodal agent benchmarks. Building developer-first tooling requires hyper-lean operations — our platform automates SDR prospecting with zero hallucinations via deterministic policies. Would you have 10 mins this week?',
            'source_references': ['https://vectorforge.example', 'HuggingFace Model Card']
        },
        status='PENDING'
    )
    app_normal1.created_at = normal_created_at

    # Pending approval for Vikram in Camp B
    app_normal2 = ApprovalRequest(
        campaign_id=camp_b.id,
        campaign_prospect_id=cp_b3.id,
        representative_id=reps[1].id, # Vikram
        request_type='OUTREACH_DRAFT',
        payload={
            'summary': 'Banking regulatory audit pitch for Arjun Das',
            'channel': 'email',
            'priority': 'NORMAL',
            'intent': 'OUTREACH',
            'agent': 'PERSONALIZATION',
            'prompt_version': '1.0.0',
            'message': 'Hi Arjun, as PaySecure scales transaction processing, meeting automated compliance guardrails becomes critical. We provide an air-gapped deterministic policy engine for all outbound customer touchpoints. Let\'s connect.',
            'source_references': ['https://paysecure.example']
        },
        status='PENDING'
    )
    app_normal2.created_at = normal_created_at

    db.add_all([app_aging, app_normal1, app_normal2])
    await db.flush()

    # 10. Agent Runs & Outreach Events
    runs = [
        AgentRun(campaign_id=camp_a.id, prospect_id=prospects[0].id, agent_type='DISCOVERY', status='COMPLETED', output_data={'tool': 'APOLLO', 'candidates_found': 25, 'status': 'SUCCESS'}),
        AgentRun(campaign_id=camp_a.id, prospect_id=prospects[0].id, agent_type='RESEARCH', status='COMPLETED', output_data={'tool': 'WEB_SEARCH', 'candidate_status': 'verified'}),
        AgentRun(campaign_id=camp_a.id, prospect_id=prospects[0].id, agent_type='ICP_FITMENT', status='COMPLETED', output_data={'engine_version': 'icp-fitment-v1', 'overall_fit_score': 92.5}),
        AgentRun(campaign_id=camp_b.id, prospect_id=prospects[2].id, agent_type='CONVERSATION', status='COMPLETED', output_data={'classification': 'REPLY', 'sentiment': 'INQUISITIVE'}),
        AgentRun(campaign_id=camp_a.id, prospect_id=prospects[0].id, agent_type='CONVERSATION', status='COMPLETED', output_data={'classification': 'MEETING', 'sentiment': 'POSITIVE'}),
    ]
    db.add_all(runs)

    events = [
        OutreachEvent(campaign_id=camp_a.id, prospect_id=prospects[0].id, channel='email', status='SENT', content='Engineering productivity workflows'),
        OutreachEvent(campaign_id=camp_b.id, prospect_id=prospects[2].id, channel='email', status='SENT', content='Compliant automated verification at FinBridge'),
        OutreachEvent(campaign_id=camp_b.id, prospect_id=prospects[3].id, channel='linkedin', status='SENT', content='Core banking infrastructure modernisation'),
    ]
    db.add_all(events)

    # 11. Knowledge Documents (Categorized as requested in Requirement 9)
    docs = [
        ('Platform Overview & Policy Architecture', 'Our autonomous multi-channel SDR platform uses a deterministic policy engine to enforce working hours, DNC suppression, contact frequency limits, and capacity thresholds before any outreach event can fire.', 'global'),
        ('Tone of Voice & Messaging Standards', 'Keep all outbound messages concise (under 80 words), grounded in verified research evidence, and free of hype. Always articulate a clear, friction-free value proposition.', 'global'),
        ('US SaaS Playbook: Engineering Productivity', 'When targeting CTOs and VPs of Engineering, highlight autonomous execution, high-signal developer ergonomics, and API-driven orchestration.', 'campaign_us_saas'),
        ('India BFSI Playbook: Regulatory & Compliance Governance', 'When communicating with Indian BFSI CIOs, prioritize data residency, RBI guidelines compliance, zero hallucination deterministic policies, and complete audit trails.', 'campaign_india_bfsi'),
        ('Handling Objections: Enterprise Security & Governance', 'For SOC2, ISO27001, or data residency inquiries, explain our air-gapped architecture where sensitive customer data never enters third-party LLM training pipelines.', 'global')
    ]
    db.add_all([KnowledgeDocument(title=t, content=c, category=cat) for t, c, cat in docs])

    # 12. Prompt Versions
    prompts = [
        PromptVersion(agent_type='qualification', version='1.0.0', prompt_text='Evaluate prospect company profile, funding stage, and technology stack against ICP criteria.'),
        PromptVersion(agent_type='strategy', version='1.0.0', prompt_text='Select the optimal primary outreach channel (Email, LinkedIn, Message) based on contact role and verified presence.'),
        PromptVersion(agent_type='personalization', version='1.0.0', prompt_text='Draft concise, highly personalized outreach citing verified research signals and recent company milestones.'),
        PromptVersion(agent_type='conversation', version='1.0.0', prompt_text='Classify inbound responses into MEETING_INTENT, INFORMATION_REQUEST, OBJECTION, or NOT_INTERESTED.')
    ]
    db.add_all(prompts)

    await db.commit()
