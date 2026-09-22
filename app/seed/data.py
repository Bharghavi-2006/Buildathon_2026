from datetime import datetime, timedelta
from sqlalchemy import select, delete
from app.db.models import (
    Campaign, Prospect, CampaignProspect, ResearchFact, Source,
    KnowledgeDocument, PromptVersion, CampaignAgent, CampaignChannelSettings,
    User, AccessProfile, CampaignAssignment, LeadAssignment, ApprovalRequest,
    Conversation, Message, AgentRun, OutreachEvent, ProspectResearch, ProspectFitment,
    Company, ProspectBatch, CampaignSetup,
    KnowledgeGapFlag, AgentDecision, DeliveryRecord, KnowledgeChunk, ScheduledAction,
    Hurdle, CampaignAgentConfig, SuppressionEntry, ChannelConfiguration, AuditLog,
)

# Every model that carries demo/campaign content, in strict child-before-parent
# order so deleting them doesn't violate a foreign key on Postgres (SQLite doesn't
# enforce FKs here, so ordering bugs only ever surface against the deployed DB --
# get this order wrong and a live reset fails outright). User/AccessProfile are
# deliberately never included: a reset must never touch login accounts.
_DEMO_TABLES_CHILD_FIRST = [
    KnowledgeGapFlag, AgentDecision, Message, DeliveryRecord, KnowledgeChunk,
    ScheduledAction, Hurdle, LeadAssignment, ApprovalRequest, ProspectFitment,
    ProspectResearch, CampaignAgentConfig, AgentRun, OutreachEvent, Conversation,
    CampaignProspect, ProspectBatch, ResearchFact, SuppressionEntry,
    CampaignAssignment, CampaignAgent, CampaignChannelSettings, ChannelConfiguration,
    CampaignSetup, Campaign, Prospect, Company, KnowledgeDocument, PromptVersion,
    Source, AuditLog,
]


async def _clear_demo_tables(db):
    for model in _DEMO_TABLES_CHILD_FIRST:
        await db.execute(delete(model))
    await db.commit()

# Hero campaign working hours: shared literally between the campaign's channel settings
# and Aisha's profile so the RepMatchEngine's timezone/working-hours dimensions score
# as a full match -- this is demo *data* tuning, not a change to the scoring engine.
HERO_TIMEZONE = 'America/Los_Angeles'
# A full-day window (0-24), not a real 9-6 shift: PolicyEngine's OUTSIDE_WORKING_HOURS
# check compares this start/end directly against the raw UTC hour (it doesn't convert by
# timezone), so a real 9-18 window would make live demo actions randomly fail depending on
# what time of day the presentation happens to run. A full-day window keeps the timezone
# match for rep-matching (below) while never blocking a live send regardless of clock time.
HERO_HOURS = {'timezone': HERO_TIMEZONE, 'start': 0, 'end': 24}

# Every campaign redirects real outbound sends to this single fixed inbox for the demo --
# never a per-campaign configurable "demo mode" the UI exposes, just always-on safe delivery.
DEMO_RECIPIENT_EMAIL = 'ch24b007@smail.iitm.ac.in'


async def seed(db):
    # Check if comprehensive seed is already applied
    existing_campaigns = (await db.scalars(select(Campaign))).all()
    if existing_campaigns and len(existing_campaigns) >= 3 and await db.scalar(select(Conversation)):
        return
    await _clear_demo_tables(db)
    await _seed_canonical_data(db)


async def force_reset(db):
    """Wipes every campaign/prospect/conversation/etc. row (never User or
    AccessProfile, so login accounts survive) and reseeds the canonical 3-campaign
    demo dataset from scratch. Unlike seed(), this always runs regardless of what's
    already in the database -- it's what the manager-only reset endpoint calls to
    give a clean, conflict-free slate on a database that's accumulated test data."""
    await _clear_demo_tables(db)
    await _seed_canonical_data(db)


async def _seed_canonical_data(db):

    # 1. Users & Access Profiles
    manager = await db.scalar(select(User).where(User.email == 'manager@demo.local'))
    if not manager:
        manager = User(name='Arjun', email='manager@demo.local')
        db.add(manager)
        await db.flush()
        db.add(AccessProfile(user_id=manager.id, role='MANAGER', max_active_leads=0))
    elif manager.name != 'Arjun':
        manager.name = 'Arjun'

    # Aisha's specialties/regions/timezone/channels are set to be a near-perfect
    # configuration match for Campaign 1 (the hero campaign below) -- this demonstrates
    # RepMatchEngine's transparent, explainable scoring, not an ML prediction.
    team = [
        ('Aisha Rep', 'aisha@demo.local', 'REPRESENTATIVE', 20,
         ['B2B SaaS', 'Enterprise Software', 'CTO', 'VP Engineering', 'Head of Engineering', 'Director Engineering'],
         ['US', 'Global'], ['email', 'linkedin', 'message', 'voice'], HERO_TIMEZONE, {'start': 0, 'end': 24}),
        ('Vikram Rep', 'vikram@demo.local', 'REPRESENTATIVE', 15, ['BFSI', 'Enterprise'], ['India', 'APAC'], ['email', 'linkedin'], 'Asia/Kolkata', {'start': 9, 'end': 18}),
        ('Alex Mercer', 'alex.mercer@demo.local', 'REPRESENTATIVE', 20, ['SaaS', 'Security', 'CTO'], ['US'], ['email', 'linkedin'], 'America/New_York', {'start': 9, 'end': 17}),
        ('Maya Patel', 'maya.patel@demo.local', 'REPRESENTATIVE', 15, ['Fintech', 'Payments'], ['India', 'US'], ['email'], '', {}),
        ('James O\'Brien', 'james.obrien@demo.local', 'REPRESENTATIVE', 15, ['Enterprise Software'], ['EMEA'], ['email'], '', {}),
        ('Sarah Kim', 'sarah.kim@demo.local', 'REPRESENTATIVE', 20, ['AI/ML', 'DevTools'], ['US'], ['email'], '', {}),
    ]

    reps = []
    for name, email, role, max_leads, specs, regs, channels, tz, hours in team:
        u = await db.scalar(select(User).where(User.email == email))
        if not u:
            u = User(name=name, email=email)
            db.add(u)
            await db.flush()
            db.add(AccessProfile(user_id=u.id, role=role, max_active_leads=max_leads, specialties=specs, regions=regs, supported_channels=channels, timezone=tz, working_hours=hours, active=True))
        reps.append(u)
    aisha, vikram, alex, maya, james, sarah = reps
    await db.commit()

    # 2. Companies
    companies = {
        'cloudscale': Company(name='CloudScale Systems', website='https://cloudscale.example', industry='SaaS', employee_count=250),
        'finbridge': Company(name='FinBridge Technologies', website='https://finbridge.example', industry='BFSI', employee_count=450),
        'vaultbank': Company(name='VaultBank Global', website='https://vaultbank.example', industry='BFSI', employee_count=1200),
        'paysecure': Company(name='PaySecure Networks', website='https://paysecure.example', industry='BFSI', employee_count=320),
        'meridian': Company(name='Meridian Cloud Systems', website='https://meridiancloud.example', industry='B2B SaaS', employee_count=1200),
        'northstar': Company(name='Northstar DevOps', website='https://northstardevops.example', industry='B2B SaaS', employee_count=450),
        'ledgerly': Company(name='Ledgerly Technologies', website='https://ledgerly.example', industry='B2B SaaS / Consulting Services', employee_count=3000),
        'vantage': Company(name='Vantage Platform Inc', website='https://vantageplatform.example', industry='B2B SaaS', employee_count=180),
        'corex': Company(name='Corex Software', website='https://corexsoftware.example', industry='Enterprise Software', employee_count=2200),
        'bridgeline': Company(name='Bridgeline SaaS', website='https://bridgelinesaas.example', industry='B2B SaaS', employee_count=600),
        'fieldstone': Company(name='Fieldstone Cloud', website='https://fieldstonecloud.example', industry='B2B SaaS', employee_count=350),
        'ironclad': Company(name='Ironclad Systems', website='https://ironcladsystems.example', industry='Enterprise Software', employee_count=4500),
        'wavepoint': Company(name='Wavepoint Technologies', website='https://wavepoint.example', industry='B2B SaaS', employee_count=900),
        'freshworks': Company(name='Freshworks (Demo)', website='https://freshworks.example', industry='B2B SaaS', employee_count=4800),
    }
    db.add_all(companies.values())
    await db.flush()

    # 3. Campaigns -- exactly three, each with a distinct demo purpose.
    camp_1 = Campaign(
        name='US Enterprise SaaS Engineering Leaders',
        description='Hero end-to-end campaign: full Discovery -> Research -> ICP Fitment -> Rep Matching -> Outreach -> Approval -> Delivery -> Conversation pipeline targeting engineering leadership at mid-to-large B2B SaaS companies.',
        status='LIVE',
        demo_mode=True,
        target_geography='US',
        target_industries=['B2B SaaS', 'Enterprise Software'],
        target_roles=['CTO', 'VP Engineering', 'Head of Engineering', 'Director Engineering'],
        company_size={'min': 200, 'max': 5000},
        instructions='Focus on engineering velocity, autonomous outbound workflows, and developer productivity. Exclude consulting agencies and companies below 200 employees.',
        active_channels=['email', 'linkedin', 'message', 'voice'],
        daily_outreach_limit=25,
        approval_required=True,
        demo_recipient_email=DEMO_RECIPIENT_EMAIL,
    )
    camp_2 = Campaign(
        name='US SaaS Enterprise CTOs',
        description='A second, independently-run SaaS campaign targeting CTOs/CIOs -- deliberately overlaps one prospect with the hero campaign to demonstrate real cross-campaign conflict detection.',
        status='LIVE',
        demo_mode=True,
        target_geography='US',
        target_industries=['SaaS', 'Cloud'],
        target_roles=['CTO', 'CIO', 'VP Engineering'],
        company_size={'min': 200, 'max': 5000},
        instructions='Focus on engineering velocity, autonomous outbound workflows, and developer productivity.',
        active_channels=['email', 'linkedin', 'voice'],
        daily_outreach_limit=25,
        approval_required=True,
        demo_recipient_email=DEMO_RECIPIENT_EMAIL,
    )
    camp_3 = Campaign(
        name='India BFSI Digital Transformation Leaders',
        description='Enterprise outreach to CIOs, CTOs, CDOs, Heads of Digital, and VPs of Technology at leading Indian banking and financial institutions. Paused by the manager -- open conversations remain accessible and this does not affect Campaigns 1 or 2.',
        status='PAUSED',
        demo_mode=True,
        target_geography='India',
        target_industries=['BFSI', 'Fintech'],
        target_roles=['CIO', 'CTO', 'CDO', 'Head of Digital', 'VP Technology'],
        company_size={'min': 500, 'max': 5000},
        instructions='Emphasize enterprise compliance, deterministic policies, data sovereignty, and audit trails.',
        active_channels=['email', 'linkedin', 'voice'],
        daily_outreach_limit=15,
        approval_required=True,
        demo_recipient_email=DEMO_RECIPIENT_EMAIL,
    )
    db.add_all([camp_1, camp_2, camp_3])
    await db.flush()
    campaigns = [camp_1, camp_2, camp_3]

    db.add(CampaignSetup(campaign_id=camp_1.id, owner_id=manager.id, exclusion_criteria=['Consulting / professional services agencies', 'Companies below 200 employees']))
    db.add(CampaignSetup(campaign_id=camp_2.id, owner_id=manager.id))
    db.add(CampaignSetup(campaign_id=camp_3.id, owner_id=manager.id))

    # Agents and channel settings for all three. Campaign 1 gets all four channels
    # (email/linkedin/message/voice) with shared working hours so representative
    # matching can score a real timezone/working-hours overlap.
    agent_types = ['DISCOVERY', 'ICP_FITMENT', 'RESEARCH', 'OUTREACH_STRATEGY', 'PERSONALIZATION', 'CONVERSATION', 'FOLLOW_UP', 'VOICE']
    for c in campaigns:
        for at in agent_types:
            db.add(CampaignAgent(campaign_id=c.id, agent_type=at, enabled=True))
        for ch in ['email', 'linkedin', 'message', 'voice']:
            enabled = ch in c.active_channels
            hours = HERO_HOURS if (c.id == camp_1.id and enabled) else {}
            db.add(CampaignChannelSettings(campaign_id=c.id, channel=ch, enabled=enabled, daily_limit=c.daily_outreach_limit, working_hours=hours, approval_required=c.approval_required))
    await db.flush()

    # Campaign assignments. Aisha and Alex both cover Campaign 1 and Campaign 2;
    # Vikram covers Campaign 3. Aisha's total lead load across every campaign below is
    # intentionally exactly 4 (of her capacity of 20) so the rep-matching capacity
    # dimension lands on the documented 12/15 example.
    db.add(CampaignAssignment(campaign_id=camp_1.id, representative_id=aisha.id, assigned_by_id=manager.id, daily_send_limit=25, active=True))
    db.add(CampaignAssignment(campaign_id=camp_1.id, representative_id=alex.id, assigned_by_id=manager.id, daily_send_limit=25, active=True))
    db.add(CampaignAssignment(campaign_id=camp_2.id, representative_id=aisha.id, assigned_by_id=manager.id, daily_send_limit=25, active=True))
    db.add(CampaignAssignment(campaign_id=camp_2.id, representative_id=alex.id, assigned_by_id=manager.id, daily_send_limit=25, active=True))
    db.add(CampaignAssignment(campaign_id=camp_3.id, representative_id=vikram.id, assigned_by_id=manager.id, daily_send_limit=20, active=True))
    await db.flush()

    # 4. Campaign 2 & 3 prospects (kept from the earlier seed, renamed campaign attached)
    p_ava = Prospect(first_name='Ava', last_name='Reed', email='ava.reed@cloudscale.example', phone='+1-415-555-0101', linkedin_url='https://linkedin.com/in/avareed', title='CTO', company_id=companies['cloudscale'].id, location='San Francisco, US', industry='SaaS', employee_count=250, website='https://cloudscale.example', lifecycle_status='CONTACTED', metadata_={'discovery_source': 'APOLLO', 'source_id': 'apollo-ava.reed', 'company_name': 'CloudScale Systems'})
    p_marcus = Prospect(first_name='Marcus', last_name='Brody', email='marcus.brody@cloudscale.example', phone='+1-415-555-0102', linkedin_url='https://linkedin.com/in/marcusbrody', title='VP Engineering', company_id=companies['cloudscale'].id, location='Austin, US', industry='SaaS', employee_count=250, website='https://cloudscale.example', lifecycle_status='QUALIFIED', metadata_={'discovery_source': 'APOLLO', 'source_id': 'apollo-marcus.brody', 'company_name': 'CloudScale Systems'})
    p_rohan = Prospect(first_name='Rohan', last_name='Mehta', email='rohan.mehta@finbridge.example', phone='+91-22-555-0103', linkedin_url='https://linkedin.com/in/rohanmehta', title='CIO', company_id=companies['finbridge'].id, location='Mumbai, India', industry='BFSI', employee_count=450, website='https://finbridge.example', lifecycle_status='CONTACTED', metadata_={'discovery_source': 'APOLLO', 'source_id': 'apollo-rohan.mehta', 'company_name': 'FinBridge Technologies'})
    p_isha = Prospect(first_name='Isha', last_name='Kapoor', email='isha.kapoor@vaultbank.example', phone='+91-11-555-0104', linkedin_url='https://linkedin.com/in/ishakapoor', title='Head of Technology', company_id=companies['vaultbank'].id, location='Delhi, India', industry='BFSI', employee_count=1200, website='https://vaultbank.example', lifecycle_status='CONTACTED', metadata_={'discovery_source': 'APOLLO', 'source_id': 'apollo-isha.kapoor', 'company_name': 'VaultBank Global'})
    p_arjun = Prospect(first_name='Arjun', last_name='Das', email='arjun.das@paysecure.example', phone='+91-80-555-0105', linkedin_url='https://linkedin.com/in/arjundas', title='CIO', company_id=companies['paysecure'].id, location='Bengaluru, India', industry='BFSI', employee_count=320, website='https://paysecure.example', lifecycle_status='RESEARCHED', metadata_={'discovery_source': 'APOLLO', 'source_id': 'apollo-arjun.das', 'company_name': 'PaySecure Networks'})
    db.add_all([p_ava, p_marcus, p_rohan, p_isha, p_arjun])
    await db.flush()

    # 5. Campaign 1 (hero): exactly 10 discovered prospects, distributed across the
    # funnel so DISCOVERED=10, RESEARCHED=8, QUALIFIED=6, OUTREACH READY=3,
    # PENDING APPROVAL=2, CONTACTED=1 -- all as real database records.
    #   stage 'discovered'          -> DISCOVERED only, no research                (2)
    #   stage 'researched_excluded' -> researched, disqualified (exclusion hit)     (1)
    #   stage 'researched_toosmall' -> researched, disqualified (company size)      (1)
    #   stage 'qualified'           -> researched + qualified, no draft yet         (3)
    #   stage 'pending'             -> qualified + drafted, ApprovalRequest PENDING (2)
    #   stage 'contacted'           -> qualified + drafted + approved + SENT        (1)
    HERO_PROSPECT_DEFS = [
        ('Sofia', 'Alvarez', 'meridian', 'CTO', 'San Francisco, US', '+1-415-555-0301', 'discovered'),
        ('Derek', 'Chen', 'northstar', 'VP Engineering', 'Seattle, US', '+1-206-555-0302', 'discovered'),
        ('Priya', 'Raman', 'ledgerly', 'Head of Engineering', 'Austin, US', '+1-512-555-0303', 'researched_excluded'),
        ('Owen', 'Fitzgerald', 'vantage', 'Director Engineering', 'Denver, US', '+1-303-555-0304', 'researched_toosmall'),
        ('Naomi', 'Cole', 'corex', 'CTO', 'Boston, US', '+1-617-555-0305', 'qualified'),
        ('Ben', 'Whitfield', 'bridgeline', 'VP Engineering', 'Chicago, US', '+1-312-555-0306', 'qualified'),
        ('Grace', 'Liu', 'fieldstone', 'Head of Engineering', 'San Jose, US', '+1-408-555-0307', 'qualified'),
        ('Marcus', 'Idowu', 'ironclad', 'CTO', 'New York, US', '+1-212-555-0308', 'pending'),
        ('Elena', 'Petrova', 'wavepoint', 'Director Engineering', 'Denver, US', '+1-720-555-0309', 'pending'),
        ('Priya', 'Nair', 'freshworks', 'CTO', 'San Mateo, US', '+1-650-555-0310', 'contacted'),
    ]
    # Elena Petrova's approval is drafted on the LinkedIn channel, so she gets a real,
    # clickable LinkedIn profile for live demos rather than a fabricated linkedin.com/in/ URL.
    REAL_LINKEDIN_URLS = {
        'Elena_Petrova': 'https://www.linkedin.com/in/venkata-bharghavi-dharmavaram-53903a346/',
    }
    hero_prospects = {}
    for first, last, company_key, title, location, phone, stage in HERO_PROSPECT_DEFS:
        company = companies[company_key]
        email = f'{first.lower()}.{last.lower()}@{company.website.replace("https://", "")}'
        linkedin_url = REAL_LINKEDIN_URLS.get(f'{first}_{last}', f'https://linkedin.com/in/{first.lower()}{last.lower()}')
        p = Prospect(first_name=first, last_name=last, email=email, phone=phone,
                      linkedin_url=linkedin_url, title=title,
                      company_id=company.id, location=location, industry=company.industry,
                      employee_count=company.employee_count, website=company.website,
                      lifecycle_status='DISCOVERED' if stage == 'discovered' else 'RESEARCHED' if stage.startswith('researched') else 'CONTACTED' if stage == 'contacted' else 'QUALIFIED',
                      metadata_={'discovery_source': 'DEMO', 'source_id': f'demo-{first.lower()}-{last.lower()}', 'company_name': company.name})
        db.add(p)
        hero_prospects[stage + '_' + first] = (p, stage, company)
    await db.flush()

    hero_cps = {}
    for key, (p, stage, company) in hero_prospects.items():
        if stage == 'discovered':
            cp = CampaignProspect(campaign_id=camp_1.id, prospect_id=p.id, qualification_status='PENDING', qualification_score=0, qualification_reason='Awaiting research.', current_stage='DISCOVERED')
        elif stage == 'researched_excluded':
            cp = CampaignProspect(campaign_id=camp_1.id, prospect_id=p.id, qualification_status='NOT_A_FIT', qualification_score=42.0, qualification_reason='Company profile indicates a consulting/professional-services agency, an explicit campaign exclusion.', current_stage='RESEARCHED')
        elif stage == 'researched_toosmall':
            cp = CampaignProspect(campaign_id=camp_1.id, prospect_id=p.id, qualification_status='NOT_A_FIT', qualification_score=55.0, qualification_reason='Company headcount (180) falls below the configured 200-employee minimum.', current_stage='RESEARCHED')
        elif stage == 'qualified':
            cp = CampaignProspect(campaign_id=camp_1.id, prospect_id=p.id, qualification_status='QUALIFIED', qualification_score=88.0, qualification_reason=f'{p.title} title match; {company.name} fits ICP industry and headcount range.', current_stage='OUTREACH_ELIGIBLE')
        elif stage == 'pending':
            cp = CampaignProspect(campaign_id=camp_1.id, prospect_id=p.id, qualification_status='QUALIFIED', qualification_score=90.0, qualification_reason=f'{p.title} title match; strong ICP fit on industry, geography, and headcount.', current_stage='PENDING_APPROVAL')
        else:  # contacted
            cp = CampaignProspect(campaign_id=camp_1.id, prospect_id=p.id, qualification_status='QUALIFIED', qualification_score=93.0, qualification_reason=f'{p.title} title match; strongest ICP fit in this batch.', current_stage='DELIVERED', last_contacted_at=datetime.utcnow() - timedelta(hours=5))
        db.add(cp)
        hero_cps[key] = cp
    await db.flush()

    # Conflict demo: the Freshworks/Priya Nair prospect discovered in Campaign 2 as well,
    # while she's already been contacted in Campaign 1 -- a real, queryable cross-campaign
    # conflict (the same relational check PolicyEngine and the sourcing UI both use).
    freshworks_prospect = hero_prospects['contacted_Priya'][0]
    cp_conflict = CampaignProspect(campaign_id=camp_2.id, prospect_id=freshworks_prospect.id, qualification_status='PREVIEW', qualification_score=85.0, qualification_reason='CTO title match; SaaS industry match.', current_stage='DISCOVERED')
    db.add(cp_conflict)

    # 6. Campaign 2 & 3 campaign_prospects (from the earlier seed)
    cp_2_ava = CampaignProspect(campaign_id=camp_2.id, prospect_id=p_ava.id, qualification_status='QUALIFIED', qualification_score=92.0, qualification_reason='Role & SaaS match; Series B verified', current_stage='CONTACTED', last_contacted_at=datetime.utcnow() - timedelta(hours=6))
    cp_2_marcus = CampaignProspect(campaign_id=camp_2.id, prospect_id=p_marcus.id, qualification_status='QUALIFIED', qualification_score=88.0, qualification_reason='VP Eng title match; engineering headcount > 50', current_stage='QUALIFIED')
    cp_3_rohan = CampaignProspect(campaign_id=camp_3.id, prospect_id=p_rohan.id, qualification_status='QUALIFIED', qualification_score=90.0, qualification_reason='CIO role match; BFSI compliance fit', current_stage='CONTACTED', last_contacted_at=datetime.utcnow() - timedelta(hours=14))
    cp_3_isha = CampaignProspect(campaign_id=camp_3.id, prospect_id=p_isha.id, qualification_status='QUALIFIED', qualification_score=85.0, qualification_reason='Head of Tech at Tier 1 Bank', current_stage='CONTACTED', last_contacted_at=datetime.utcnow() - timedelta(hours=28))
    cp_3_arjun = CampaignProspect(campaign_id=camp_3.id, prospect_id=p_arjun.id, qualification_status='PENDING', qualification_score=75.0, qualification_reason='Research completed; awaiting review', current_stage='RESEARCHED')
    db.add_all([cp_2_ava, cp_2_marcus, cp_3_rohan, cp_3_isha, cp_3_arjun])
    await db.flush()

    # 7. Lead assignments. Aisha: 2 from Campaign 2 (Ava, Marcus) + 2 from Campaign 1
    # (the two 'pending' hero leads) = 4 total -- see the capacity comment above.
    db.add(LeadAssignment(campaign_prospect_id=cp_2_ava.id, representative_id=aisha.id, assigned_by_id=manager.id, status='ASSIGNED'))
    db.add(LeadAssignment(campaign_prospect_id=cp_2_marcus.id, representative_id=aisha.id, assigned_by_id=manager.id, status='ASSIGNED'))
    db.add(LeadAssignment(campaign_prospect_id=hero_cps['pending_Marcus'].id, representative_id=aisha.id, assigned_by_id=manager.id, status='ASSIGNED'))
    db.add(LeadAssignment(campaign_prospect_id=hero_cps['pending_Elena'].id, representative_id=aisha.id, assigned_by_id=manager.id, status='ASSIGNED'))
    # Alex holds the remaining assigned hero leads (qualified-only + contacted).
    for key in ['qualified_Naomi', 'qualified_Ben', 'qualified_Grace', 'contacted_Priya']:
        db.add(LeadAssignment(campaign_prospect_id=hero_cps[key].id, representative_id=alex.id, assigned_by_id=manager.id, status='ASSIGNED'))
    db.add(LeadAssignment(campaign_prospect_id=cp_3_rohan.id, representative_id=vikram.id, assigned_by_id=manager.id, status='ASSIGNED'))
    db.add(LeadAssignment(campaign_prospect_id=cp_3_isha.id, representative_id=vikram.id, assigned_by_id=manager.id, status='ASSIGNED'))
    db.add(LeadAssignment(campaign_prospect_id=cp_3_arjun.id, representative_id=vikram.id, assigned_by_id=manager.id, status='ASSIGNED'))
    await db.flush()

    # 8. Open conversations for Campaign 3 (paused -- must remain accessible/replyable).
    conv_3_rohan = Conversation(campaign_id=camp_3.id, prospect_id=p_rohan.id, status='OPEN')
    db.add(conv_3_rohan)
    await db.flush()
    db.add(Message(conversation_id=conv_3_rohan.id, direction='OUTBOUND', channel='email', subject='Compliant automated verification at FinBridge', content=f'Hi {p_rohan.first_name}, I noticed FinBridge\'s recent expansion in compliant payment gateways. Would love to share how our SDR platform enables automated policy compliance.'))
    db.add(Message(conversation_id=conv_3_rohan.id, direction='INBOUND', channel='email', subject='Re: Compliant automated verification at FinBridge', content='Thanks for reaching out. We are currently evaluating automated verification workflows. Can you share your SOC2 Type II certification details?'))

    conv_3_isha = Conversation(campaign_id=camp_3.id, prospect_id=p_isha.id, status='OPEN')
    db.add(conv_3_isha)
    await db.flush()
    db.add(Message(conversation_id=conv_3_isha.id, direction='OUTBOUND', channel='linkedin', subject='Core banking infrastructure modernisation', content=f'Hello {p_isha.first_name}, following up on your digital banking infrastructure initiatives at VaultBank.'))
    db.add(Message(conversation_id=conv_3_isha.id, direction='INBOUND', channel='linkedin', subject='', content='Interesting timing, we are reviewing our Q4 integration architecture. What does your policy governance engine look like?'))

    conv_2_ava = Conversation(campaign_id=camp_2.id, prospect_id=p_ava.id, status='MEETING_INTENT')
    db.add(conv_2_ava)
    await db.flush()
    db.add(Message(conversation_id=conv_2_ava.id, direction='OUTBOUND', channel='email', subject='Engineering productivity workflows', content=f'Hi {p_ava.first_name}, saw CloudScale\'s engineering team growth. We help scale outbound pipelines without burdening your leads.'))
    db.add(Message(conversation_id=conv_2_ava.id, direction='INBOUND', channel='email', subject='Re: Engineering productivity workflows', content='This looks very relevant for our upcoming hiring cycle. Can we schedule a 15-minute introductory meeting this Thursday at 2pm PST?'))

    # Campaign 1 hero conversation for the 'contacted' prospect (Priya Nair / Freshworks).
    conv_1_priya = Conversation(campaign_id=camp_1.id, prospect_id=freshworks_prospect.id, status='OPEN')
    db.add(conv_1_priya)
    await db.flush()
    db.add(Message(conversation_id=conv_1_priya.id, direction='OUTBOUND', channel='email', subject='Autonomous outbound for engineering-led SaaS teams', content=f'Hi {freshworks_prospect.first_name}, saw your team\'s recent platform expansion. We help engineering-led SaaS orgs run policy-governed outbound without pulling engineers into pipeline ops.'))
    db.add(Message(conversation_id=conv_1_priya.id, direction='INBOUND', channel='email', subject='Re: Autonomous outbound for engineering-led SaaS teams', content='Interesting -- can you share how the approval workflow and audit trail work before we consider a pilot?'))

    # Demo conversations across every non-email channel, so SMS/LinkedIn/Voice each have a
    # real example thread visible without first triggering a live simulation.
    naomi, _, _ = hero_prospects['qualified_Naomi']
    conv_1_naomi_sms = Conversation(campaign_id=camp_1.id, prospect_id=naomi.id, status='OPEN')
    db.add(conv_1_naomi_sms)
    await db.flush()
    db.add(Message(conversation_id=conv_1_naomi_sms.id, direction='OUTBOUND', channel='message', content=f'Hi {naomi.first_name}, this is Aisha from the SDR platform team -- saw Corex is modernizing its platform architecture. Worth a quick text exchange on how we keep outbound policy-governed?'))
    db.add(Message(conversation_id=conv_1_naomi_sms.id, direction='INBOUND', channel='message', content='Sure, go ahead -- keep it brief, I am between meetings.'))

    grace, _, _ = hero_prospects['qualified_Grace']
    conv_1_grace_linkedin = Conversation(campaign_id=camp_1.id, prospect_id=grace.id, status='OPEN')
    db.add(conv_1_grace_linkedin)
    await db.flush()
    db.add(Message(conversation_id=conv_1_grace_linkedin.id, direction='OUTBOUND', channel='linkedin', content=f'Hi {grace.first_name}, congrats on Fieldstone\'s recent platform milestones. We help engineering-led SaaS orgs run policy-governed outbound without pulling engineers into pipeline ops -- open to connecting?'))
    db.add(Message(conversation_id=conv_1_grace_linkedin.id, direction='INBOUND', channel='linkedin', content='Thanks for reaching out -- connected. Curious how the approval workflow holds up at scale.'))

    ben, _, _ = hero_prospects['qualified_Ben']
    conv_1_ben_voice = Conversation(campaign_id=camp_1.id, prospect_id=ben.id, status='OPEN')
    db.add(conv_1_ben_voice)
    await db.flush()
    voice_transcript = [
        {'speaker': 'AI', 'text': f'Hi, this is the Autonomous SDR platform calling on behalf of our team for {ben.first_name}. Do you have two minutes?'},
        {'speaker': 'Prospect', 'text': 'I can spare a couple of minutes, sure.'},
        {'speaker': 'AI', 'text': 'Great -- we help engineering-led SaaS orgs like Bridgeline run policy-governed outbound without pulling engineers into pipeline ops. Would a short follow-up call with more detail make sense next week?'},
    ]
    db.add(Message(conversation_id=conv_1_ben_voice.id, direction='OUTBOUND', channel='voice', content=voice_transcript[0]['text']))
    db.add(Message(conversation_id=conv_1_ben_voice.id, direction='INBOUND', channel='voice', content=voice_transcript[1]['text']))
    db.add(Message(conversation_id=conv_1_ben_voice.id, direction='OUTBOUND', channel='voice', content=voice_transcript[2]['text']))
    await db.flush()
    db.add(AgentRun(campaign_id=camp_1.id, prospect_id=ben.id, agent_type='VOICE', status='COMPLETED', output_data={'call_status': 'DEMO_CONNECTED', 'transcript': voice_transcript, 'intent': 'INTERESTED', 'outcome': 'FOLLOW_UP_REQUIRED', 'policy': 'ALLOW', 'human_escalation': False}))
    db.add(OutreachEvent(campaign_id=camp_1.id, prospect_id=ben.id, channel='voice', status='SENT', content=voice_transcript[0]['text']))

    # 9. Research + ICP Fitment for every hero prospect that has reached at least
    # RESEARCHED (8 total): 2 disqualified, 3 qualified-only, 2 pending, 1 contacted.
    RESEARCH_PROFILES = {
        'researched_excluded_Priya': dict(
            summary='Head of Engineering at Ledgerly Technologies. Research surfaces Ledgerly primarily as a consulting/professional-services firm building bespoke software for clients, not a product-led SaaS company.',
            person={'current_role': 'Head of Engineering', 'tenure': '1 year'},
            company={'company_name': 'Ledgerly Technologies', 'industry': 'B2B SaaS / Consulting Services', 'employee_count': 3000, 'business_model': 'Custom software consulting and staff augmentation for enterprise clients'},
            org_criteria=[
                {'criterion': 'industry', 'status': 'MATCHED', 'expected_value': ['B2B SaaS', 'Enterprise Software'], 'actual_value': 'B2B SaaS / Consulting Services', 'reason': 'Nominally industry-adjacent.'},
                {'criterion': 'exclusion', 'status': 'UNMATCHED', 'expected_value': 'Not a consulting agency', 'actual_value': 'consulting agency', 'reason': 'Research explicitly indicates a configured exclusion: Ledgerly operates as a consulting/professional-services firm.'},
            ],
            contact_criteria=[{'criterion': 'target_role', 'status': 'MATCHED', 'expected_value': ['CTO', 'VP Engineering', 'Head of Engineering', 'Director Engineering'], 'actual_value': 'Head of Engineering', 'reason': 'Title matches configured target roles.'}],
            org_score=42.0, contact_score=100.0, overall=42.0, org_status='NOT_A_FIT', contact_status='MATCHED', overall_status='NOT_A_FIT', next_stage='NOT_A_FIT',
            risks=['Business model is consulting/services, not a product-led SaaS company -- an explicit campaign exclusion.'], signals=['Title matches configured target roles.'],
        ),
        'researched_toosmall_Owen': dict(
            summary='Director of Engineering at Vantage Platform Inc, a small B2B SaaS company. Verified headcount (180) is below the campaign\'s configured 200-employee minimum.',
            person={'current_role': 'Director of Engineering', 'tenure': '2 years'},
            company={'company_name': 'Vantage Platform Inc', 'industry': 'B2B SaaS', 'employee_count': 180},
            org_criteria=[
                {'criterion': 'industry', 'status': 'MATCHED', 'expected_value': ['B2B SaaS', 'Enterprise Software'], 'actual_value': 'B2B SaaS', 'reason': 'Industry matches campaign ICP.'},
                {'criterion': 'company_size', 'status': 'UNMATCHED', 'expected_value': '200-5000 employees', 'actual_value': 180, 'reason': 'Employee count (180) falls below the configured 200-employee minimum.'},
            ],
            contact_criteria=[{'criterion': 'target_role', 'status': 'MATCHED', 'expected_value': ['CTO', 'VP Engineering', 'Head of Engineering', 'Director Engineering'], 'actual_value': 'Director Engineering', 'reason': 'Title matches configured target roles.'}],
            org_score=50.0, contact_score=100.0, overall=55.0, org_status='WEAK_FIT', contact_status='MATCHED', overall_status='WEAK_FIT', next_stage='NOT_A_FIT',
            risks=['Company headcount is below the configured minimum.'], signals=['Title matches configured target roles.'],
        ),
        'qualified_Naomi': dict(
            summary='CTO at Corex Software. Verified enterprise B2B SaaS company with 2,200 employees, actively modernizing its platform architecture.',
            person={'current_role': 'CTO', 'tenure': '3 years', 'prior_companies': ['Oracle', 'Workday']},
            company={'company_name': 'Corex Software', 'industry': 'Enterprise Software', 'employee_count': 2200, 'revenue_estimate': '$140M ARR'},
            org_criteria=[
                {'criterion': 'industry', 'status': 'MATCHED', 'expected_value': ['B2B SaaS', 'Enterprise Software'], 'actual_value': 'Enterprise Software', 'reason': 'Industry matches campaign ICP.'},
                {'criterion': 'geography', 'status': 'MATCHED', 'expected_value': 'US', 'actual_value': 'Boston, US', 'reason': 'Located inside target territory.'},
                {'criterion': 'company_size', 'status': 'MATCHED', 'expected_value': '200-5000 employees', 'actual_value': 2200, 'reason': 'Employee count falls within the configured range.'},
            ],
            contact_criteria=[{'criterion': 'target_role', 'status': 'MATCHED', 'expected_value': ['CTO', 'VP Engineering', 'Head of Engineering', 'Director Engineering'], 'actual_value': 'CTO', 'reason': 'Current role is verified CTO.'}],
            org_score=100.0, contact_score=100.0, overall=90.0, org_status='STRONG_FIT', contact_status='MATCHED', overall_status='STRONG_FIT', next_stage='OUTREACH_ELIGIBLE',
            risks=[], signals=['Verified CTO at a 2,200-employee enterprise software company inside target geography.'],
        ),
        'qualified_Ben': dict(
            summary='VP Engineering at Bridgeline SaaS. Verified 600-employee B2B SaaS company scaling its platform engineering org.',
            person={'current_role': 'VP Engineering', 'tenure': '2 years 6 months'},
            company={'company_name': 'Bridgeline SaaS', 'industry': 'B2B SaaS', 'employee_count': 600},
            org_criteria=[
                {'criterion': 'industry', 'status': 'MATCHED', 'expected_value': ['B2B SaaS', 'Enterprise Software'], 'actual_value': 'B2B SaaS', 'reason': 'Industry matches campaign ICP.'},
                {'criterion': 'geography', 'status': 'MATCHED', 'expected_value': 'US', 'actual_value': 'Chicago, US', 'reason': 'Located inside target territory.'},
                {'criterion': 'company_size', 'status': 'MATCHED', 'expected_value': '200-5000 employees', 'actual_value': 600, 'reason': 'Employee count falls within the configured range.'},
            ],
            contact_criteria=[{'criterion': 'target_role', 'status': 'MATCHED', 'expected_value': ['CTO', 'VP Engineering', 'Head of Engineering', 'Director Engineering'], 'actual_value': 'VP Engineering', 'reason': 'Current role is verified VP Engineering.'}],
            org_score=100.0, contact_score=100.0, overall=88.0, org_status='STRONG_FIT', contact_status='MATCHED', overall_status='STRONG_FIT', next_stage='OUTREACH_ELIGIBLE',
            risks=[], signals=['Verified VP Engineering at a 600-employee B2B SaaS company inside target geography.'],
        ),
        'qualified_Grace': dict(
            summary='Head of Engineering at Fieldstone Cloud. Verified 350-employee B2B SaaS company.',
            person={'current_role': 'Head of Engineering', 'tenure': '1 year 8 months'},
            company={'company_name': 'Fieldstone Cloud', 'industry': 'B2B SaaS', 'employee_count': 350},
            org_criteria=[
                {'criterion': 'industry', 'status': 'MATCHED', 'expected_value': ['B2B SaaS', 'Enterprise Software'], 'actual_value': 'B2B SaaS', 'reason': 'Industry matches campaign ICP.'},
                {'criterion': 'geography', 'status': 'MATCHED', 'expected_value': 'US', 'actual_value': 'San Jose, US', 'reason': 'Located inside target territory.'},
                {'criterion': 'company_size', 'status': 'MATCHED', 'expected_value': '200-5000 employees', 'actual_value': 350, 'reason': 'Employee count falls within the configured range.'},
            ],
            contact_criteria=[{'criterion': 'target_role', 'status': 'MATCHED', 'expected_value': ['CTO', 'VP Engineering', 'Head of Engineering', 'Director Engineering'], 'actual_value': 'Head of Engineering', 'reason': 'Current role is verified Head of Engineering.'}],
            org_score=100.0, contact_score=100.0, overall=85.0, org_status='STRONG_FIT', contact_status='MATCHED', overall_status='STRONG_FIT', next_stage='OUTREACH_ELIGIBLE',
            risks=[], signals=['Verified Head of Engineering at a 350-employee B2B SaaS company inside target geography.'],
        ),
        'pending_Marcus': dict(
            summary='CTO at Ironclad Systems. Verified 4,500-employee enterprise software company undergoing a large platform modernization initiative.',
            person={'current_role': 'CTO', 'tenure': '5 years', 'prior_companies': ['IBM']},
            company={'company_name': 'Ironclad Systems', 'industry': 'Enterprise Software', 'employee_count': 4500, 'funding': 'Publicly traded'},
            org_criteria=[
                {'criterion': 'industry', 'status': 'MATCHED', 'expected_value': ['B2B SaaS', 'Enterprise Software'], 'actual_value': 'Enterprise Software', 'reason': 'Industry matches campaign ICP.'},
                {'criterion': 'geography', 'status': 'MATCHED', 'expected_value': 'US', 'actual_value': 'New York, US', 'reason': 'Located inside target territory.'},
                {'criterion': 'company_size', 'status': 'MATCHED', 'expected_value': '200-5000 employees', 'actual_value': 4500, 'reason': 'Employee count falls within the configured range.'},
            ],
            contact_criteria=[{'criterion': 'target_role', 'status': 'MATCHED', 'expected_value': ['CTO', 'VP Engineering', 'Head of Engineering', 'Director Engineering'], 'actual_value': 'CTO', 'reason': 'Current role is verified CTO.'}],
            org_score=100.0, contact_score=100.0, overall=94.0, org_status='STRONG_FIT', contact_status='MATCHED', overall_status='STRONG_FIT', next_stage='OUTREACH_ELIGIBLE',
            risks=[], signals=['Verified CTO at a 4,500-employee enterprise software company mid-modernization.'],
        ),
        'pending_Elena': dict(
            summary='Director of Engineering at Wavepoint Technologies. Verified 900-employee B2B SaaS company.',
            person={'current_role': 'Director of Engineering', 'tenure': '3 years'},
            company={'company_name': 'Wavepoint Technologies', 'industry': 'B2B SaaS', 'employee_count': 900},
            org_criteria=[
                {'criterion': 'industry', 'status': 'MATCHED', 'expected_value': ['B2B SaaS', 'Enterprise Software'], 'actual_value': 'B2B SaaS', 'reason': 'Industry matches campaign ICP.'},
                {'criterion': 'geography', 'status': 'MATCHED', 'expected_value': 'US', 'actual_value': 'Denver, US', 'reason': 'Located inside target territory.'},
                {'criterion': 'company_size', 'status': 'MATCHED', 'expected_value': '200-5000 employees', 'actual_value': 900, 'reason': 'Employee count falls within the configured range.'},
            ],
            contact_criteria=[{'criterion': 'target_role', 'status': 'MATCHED', 'expected_value': ['CTO', 'VP Engineering', 'Head of Engineering', 'Director Engineering'], 'actual_value': 'Director Engineering', 'reason': 'Current role is verified Director of Engineering.'}],
            org_score=100.0, contact_score=100.0, overall=87.0, org_status='STRONG_FIT', contact_status='MATCHED', overall_status='STRONG_FIT', next_stage='OUTREACH_ELIGIBLE',
            risks=[], signals=['Verified Director of Engineering at a 900-employee B2B SaaS company.'],
        ),
        'contacted_Priya': dict(
            summary='CTO at Freshworks (demo). Verified 4,800-employee B2B SaaS company; strongest ICP fit in this batch and already progressed to an open conversation.',
            person={'current_role': 'CTO', 'tenure': '4 years', 'prior_companies': ['Salesforce']},
            company={'company_name': 'Freshworks (Demo)', 'industry': 'B2B SaaS', 'employee_count': 4800, 'revenue_estimate': '$600M+ ARR'},
            org_criteria=[
                {'criterion': 'industry', 'status': 'MATCHED', 'expected_value': ['B2B SaaS', 'Enterprise Software'], 'actual_value': 'B2B SaaS', 'reason': 'Industry matches campaign ICP.'},
                {'criterion': 'geography', 'status': 'MATCHED', 'expected_value': 'US', 'actual_value': 'San Mateo, US', 'reason': 'Located inside target territory.'},
                {'criterion': 'company_size', 'status': 'MATCHED', 'expected_value': '200-5000 employees', 'actual_value': 4800, 'reason': 'Employee count falls within the configured range.'},
            ],
            contact_criteria=[{'criterion': 'target_role', 'status': 'MATCHED', 'expected_value': ['CTO', 'VP Engineering', 'Head of Engineering', 'Director Engineering'], 'actual_value': 'CTO', 'reason': 'Current role is verified CTO.'}],
            org_score=100.0, contact_score=100.0, overall=96.0, org_status='STRONG_FIT', contact_status='MATCHED', overall_status='STRONG_FIT', next_stage='OUTREACH_ELIGIBLE',
            risks=[], signals=['Verified CTO at a 4,800-employee B2B SaaS company; highest-confidence match in this batch.'],
        ),
    }
    for key, profile in RESEARCH_PROFILES.items():
        p, stage, company = hero_prospects[key]
        run = AgentRun(campaign_id=camp_1.id, prospect_id=p.id, agent_type='RESEARCH', status='COMPLETED', output_data={'tool': 'DEMO', 'candidate_status': 'verified'})
        db.add(run)
        await db.flush()
        research = ProspectResearch(campaign_id=camp_1.id, prospect_id=p.id, status='verified', research_summary=profile['summary'], person_research=profile['person'], company_research=profile['company'], icp_evidence=[{'criterion': c['criterion'], 'status': c['status'], 'evidence': c['reason'], 'source': 'DEMO Research Agent'} for c in profile['org_criteria'] + profile['contact_criteria']], business_context=[], personalization_signals=profile['signals'], sources=[company.website], uncertainties=[], agent_run_id=run.id)
        db.add(research)
        await db.flush()
        db.add(ProspectFitment(campaign_id=camp_1.id, prospect_id=p.id, organization_fit_score=profile['org_score'], organization_fit_status=profile['org_status'], organization_criteria=profile['org_criteria'], contact_fit_score=profile['contact_score'], contact_fit_status=profile['contact_status'], contact_criteria=profile['contact_criteria'], overall_fit_score=profile['overall'], overall_fit_status=profile['overall_status'], recommended_next_stage=profile['next_stage'], key_fit_signals=profile['signals'], key_risk_factors=profile['risks'], uncertainties=[], research_id=research.id, engine_version='icp-fitment-v1'))
    await db.flush()

    # Existing Campaign 2/3 research (Ava Reed, Rohan Mehta) -- unchanged from the earlier seed.
    run_ava = AgentRun(id='seed-run-1', campaign_id=camp_2.id, prospect_id=p_ava.id, agent_type='RESEARCH', status='COMPLETED', output_data={'tool': 'DEMO', 'candidate_status': 'verified'})
    run_rohan = AgentRun(id='seed-run-2', campaign_id=camp_3.id, prospect_id=p_rohan.id, agent_type='RESEARCH', status='COMPLETED', output_data={'tool': 'DEMO', 'candidate_status': 'verified'})
    db.add_all([run_ava, run_rohan])
    await db.flush()
    res_ava = ProspectResearch(
        campaign_id=camp_2.id, prospect_id=p_ava.id, status='verified',
        research_summary='Verified CTO at CloudScale Systems. Company recently raised $32M Series B, scaling distributed engineering teams from 120 to 250 engineers.',
        person_research={'current_role': 'CTO', 'tenure': '2 years 4 months', 'prior_companies': ['Stripe', 'Twilio'], 'education': 'Stanford CS'},
        company_research={'company_name': 'CloudScale Systems', 'industry': 'B2B SaaS', 'employee_count': 250, 'revenue_estimate': '$18M ARR', 'funding': '$32M Series B'},
        icp_evidence=[
            {'criterion': 'Role Match', 'status': 'MATCHED', 'evidence': 'Title is Chief Technology Officer', 'source': 'LinkedIn / Company Bio'},
            {'criterion': 'Industry Match', 'status': 'MATCHED', 'evidence': 'B2B Cloud & Enterprise SaaS provider', 'source': 'Company Website'},
            {'criterion': 'Company Size', 'status': 'MATCHED', 'evidence': '250 employees confirmed via LinkedIn insights', 'source': 'Apollo'},
        ],
        business_context=['Migrating monolithic workflows to event-driven microservices', 'Hiring 40+ fullstack and platform engineers in H2'],
        personalization_signals=['Keynote speaker at CloudNative Con 2025 on automated policy governance', 'Authored technical blog post on developer ergonomics'],
        sources=['https://cloudscale.example/about', 'https://linkedin.com/in/avareed', 'https://techcrunch.example/cloudscale-series-b'],
        uncertainties=[], agent_run_id='seed-run-1',
    )
    res_rohan = ProspectResearch(
        campaign_id=camp_3.id, prospect_id=p_rohan.id, status='verified',
        research_summary='Chief Information Officer at FinBridge Technologies. Oversees digital banking architecture, security policies, and vendor risk management.',
        person_research={'current_role': 'CIO', 'tenure': '3 years', 'certifications': ['CISSP', 'CISM']},
        company_research={'company_name': 'FinBridge Technologies', 'industry': 'BFSI / Fintech', 'employee_count': 450, 'licensing': 'RBI regulated payment aggregator'},
        icp_evidence=[
            {'criterion': 'Role Match', 'status': 'MATCHED', 'evidence': 'Current CIO reporting to Managing Director', 'source': 'Company Leadership Page'},
            {'criterion': 'Geography', 'status': 'MATCHED', 'evidence': 'Headquartered in Mumbai, Maharashtra', 'source': 'MCA Filings'},
            {'criterion': 'Industry Match', 'status': 'MATCHED', 'evidence': 'Regulated BFSI & payment processing', 'source': 'Annual Report'},
        ],
        business_context=['Currently upgrading enterprise compliance audit logging', 'Modernising legacy core banking middleware'],
        personalization_signals=['Spoke on RBI compliance guidelines at BFSI Summit 2025'],
        sources=['https://finbridge.example/leadership', 'https://linkedin.com/in/rohanmehta'],
        uncertainties=['Exact vendor budget allocation for Q4 unconfirmed'], agent_run_id='seed-run-2',
    )
    db.add_all([res_ava, res_rohan])
    await db.flush()
    db.add(ProspectFitment(campaign_id=camp_2.id, prospect_id=p_ava.id, organization_fit_score=95.0, organization_fit_status='STRONG_FIT', organization_criteria=[
        {'criterion': 'industry', 'status': 'MATCHED', 'expected_value': ['SaaS', 'Cloud'], 'actual_value': 'B2B SaaS', 'reason': 'Industry matches campaign ICP.'},
        {'criterion': 'geography', 'status': 'MATCHED', 'expected_value': 'US', 'actual_value': 'San Francisco, US', 'reason': 'Location is inside target territory.'},
        {'criterion': 'company_size', 'status': 'MATCHED', 'expected_value': '200-5000 employees', 'actual_value': 250, 'reason': 'Employee count (250) falls within range.'},
    ], contact_fit_score=90.0, contact_fit_status='STRONG_FIT', contact_criteria=[{'criterion': 'target_role', 'status': 'MATCHED', 'expected_value': ['CTO', 'CIO', 'VP Engineering'], 'actual_value': 'CTO', 'reason': 'Current role is verified CTO.'}], overall_fit_score=92.5, overall_fit_status='STRONG_FIT', recommended_next_stage='OUTREACH_ELIGIBLE', key_fit_signals=['Target title CTO directly matches ICP', 'Rapid engineering team growth signal', 'Confirmed Series B funding'], key_risk_factors=[], uncertainties=[], research_id=res_ava.id, engine_version='icp-fitment-v1'))
    db.add(ProspectFitment(campaign_id=camp_3.id, prospect_id=p_rohan.id, organization_fit_score=90.0, organization_fit_status='STRONG_FIT', organization_criteria=[
        {'criterion': 'industry', 'status': 'MATCHED', 'expected_value': ['BFSI', 'Fintech'], 'actual_value': 'BFSI / Fintech', 'reason': 'Industry matches campaign ICP.'},
        {'criterion': 'geography', 'status': 'MATCHED', 'expected_value': 'India', 'actual_value': 'Mumbai, India', 'reason': 'Headquarters located in India.'},
        {'criterion': 'company_size', 'status': 'MATCHED', 'expected_value': '500-5000 employees', 'actual_value': 450, 'reason': 'Employee count within target bounds.'},
    ], contact_fit_score=85.0, contact_fit_status='STRONG_FIT', contact_criteria=[{'criterion': 'target_role', 'status': 'MATCHED', 'expected_value': ['CIO', 'CTO', 'CDO', 'Head of Digital', 'VP Technology'], 'actual_value': 'CIO', 'reason': 'Title is Chief Information Officer.'}], overall_fit_score=87.5, overall_fit_status='STRONG_FIT', recommended_next_stage='OUTREACH_ELIGIBLE', key_fit_signals=['Regulated BFSI compliance match', 'High authority budget owner'], key_risk_factors=['Longer enterprise procurement cycle typical of banking'], uncertainties=['Internal procurement sign-off required'], research_id=res_rohan.id, engine_version='icp-fitment-v1'))
    await db.flush()

    # 10. Approval Requests. Two hero PENDING drafts (Marcus Idowu, Elena Petrova), one
    # SENT (Priya Nair -> Freshworks, matching her CONTACTED stage), plus a deliberately
    # aging (>24h) Campaign 2 approval so the manager's aging-approval alert banner fires,
    # and one normal Campaign 3 approval.
    aging_created_at = datetime.utcnow() - timedelta(hours=28)
    normal_created_at = datetime.utcnow() - timedelta(hours=3)

    marcus_i, _, _ = hero_prospects['pending_Marcus']
    elena_p, _, _ = hero_prospects['pending_Elena']
    app_hero_1 = ApprovalRequest(campaign_id=camp_1.id, campaign_prospect_id=hero_cps['pending_Marcus'].id, representative_id=aisha.id, request_type='OUTREACH',
        payload={'channel': 'email', 'subject': f'Modernizing engineering ops at {companies["ironclad"].name}', 'priority': 'HIGH', 'intent': 'OUTREACH', 'agent': 'PERSONALIZATION', 'prompt_version': '1.0.0',
                 'message': f'Hi {marcus_i.first_name}, saw Ironclad\'s platform modernization initiative. We help engineering-led SaaS orgs run policy-governed outbound without pulling engineers into pipeline ops. Open to a 10-minute walkthrough?',
                 'source_references': [companies['ironclad'].website]}, status='PENDING')
    app_hero_1.created_at = normal_created_at
    app_hero_2 = ApprovalRequest(campaign_id=camp_1.id, campaign_prospect_id=hero_cps['pending_Elena'].id, representative_id=aisha.id, request_type='OUTREACH',
        payload={'channel': 'linkedin', 'subject': '', 'priority': 'NORMAL', 'intent': 'OUTREACH', 'agent': 'PERSONALIZATION', 'prompt_version': '1.0.0',
                 'message': f'Hi {elena_p.first_name} -- following up on Wavepoint\'s platform engineering roadmap. Would a 10-minute call make sense this week?',
                 'source_references': [companies['wavepoint'].website]}, status='PENDING')
    app_hero_2.created_at = normal_created_at

    app_aging = ApprovalRequest(campaign_id=camp_2.id, campaign_prospect_id=cp_2_marcus.id, representative_id=alex.id, request_type='OUTREACH_DRAFT',
        payload={'summary': 'Draft engineering velocity pitch for Marcus Brody', 'channel': 'email', 'priority': 'HIGH', 'intent': 'OUTREACH', 'agent': 'PERSONALIZATION', 'prompt_version': '1.0.0',
                 'message': 'Hi Marcus, CloudScale\'s engineering expansion caught my eye. We provide automated policy-governed outbound agents to keep GTM aligned without pulling engineers into pipeline ops. Open to a 10-minute demo next Tuesday?',
                 'source_references': ['https://cloudscale.example/careers', 'LinkedIn Headcount Insights']}, status='PENDING')
    app_aging.created_at = aging_created_at

    app_normal_3 = ApprovalRequest(campaign_id=camp_3.id, campaign_prospect_id=cp_3_arjun.id, representative_id=vikram.id, request_type='OUTREACH_DRAFT',
        payload={'summary': 'Banking regulatory audit pitch for Arjun Das', 'channel': 'email', 'priority': 'NORMAL', 'intent': 'OUTREACH', 'agent': 'PERSONALIZATION', 'prompt_version': '1.0.0',
                 'message': 'Hi Arjun, as PaySecure scales transaction processing, meeting automated compliance guardrails becomes critical. We provide an air-gapped deterministic policy engine for all outbound customer touchpoints. Let\'s connect.',
                 'source_references': ['https://paysecure.example']}, status='PENDING')
    app_normal_3.created_at = normal_created_at

    db.add_all([app_hero_1, app_hero_2, app_aging, app_normal_3])
    await db.flush()

    # The Freshworks/Priya Nair approval is already SENT, matching her CONTACTED stage.
    app_hero_sent = ApprovalRequest(campaign_id=camp_1.id, campaign_prospect_id=hero_cps['contacted_Priya'].id, representative_id=alex.id, request_type='OUTREACH',
        payload={'channel': 'email', 'subject': 'Autonomous outbound for engineering-led SaaS teams', 'priority': 'HIGH', 'intent': 'OUTREACH', 'agent': 'PERSONALIZATION', 'prompt_version': '1.0.0',
                 'message': f'Hi {freshworks_prospect.first_name}, saw your team\'s recent platform expansion. We help engineering-led SaaS orgs run policy-governed outbound without pulling engineers into pipeline ops.',
                 'source_references': [companies['freshworks'].website]}, status='SENT', decision_note='Approved by representative')
    app_hero_sent.created_at = datetime.utcnow() - timedelta(hours=6)
    db.add(app_hero_sent)
    await db.flush()

    # A genuine follow-up draft: Priya Nair already replied asking about the approval
    # workflow and audit trail (conv_1_priya, above) -- this is the AI's drafted answer,
    # still awaiting rep approval, so expanding it in the approval inbox shows the entire
    # real conversation that led up to it rather than a cold first touch.
    app_hero_followup = ApprovalRequest(campaign_id=camp_1.id, campaign_prospect_id=hero_cps['contacted_Priya'].id, representative_id=aisha.id, request_type='FOLLOW_UP',
        payload={'channel': 'email', 'subject': 'Re: Autonomous outbound for engineering-led SaaS teams', 'priority': 'HIGH', 'intent': 'FOLLOW_UP', 'agent': 'PERSONALIZATION', 'prompt_version': '1.0.0',
                 'message': f'Hi {freshworks_prospect.first_name}, great question. Every send passes through a deterministic policy engine and is gated behind representative approval -- nothing goes out without a human in the loop. We keep a full audit trail (policy decision, approver, timestamp, and delivery record) for every message. Happy to walk through the audit log in a short call this week?',
                 'source_references': [companies['freshworks'].website]}, status='PENDING')
    app_hero_followup.created_at = datetime.utcnow() - timedelta(hours=1)
    db.add(app_hero_followup)
    await db.flush()

    # 11. Agent Runs & Outreach Events (funnel/analytics evidence)
    runs = [
        AgentRun(campaign_id=camp_1.id, prospect_id=freshworks_prospect.id, agent_type='DISCOVERY', status='COMPLETED', output_data={'tool': 'DEMO', 'candidates_found': 10, 'status': 'SUCCESS'}),
        AgentRun(campaign_id=camp_1.id, prospect_id=freshworks_prospect.id, agent_type='PERSONALIZATION', status='COMPLETED', output_data={'provider': 'demo', 'channel': 'email'}),
        AgentRun(campaign_id=camp_2.id, prospect_id=p_ava.id, agent_type='DISCOVERY', status='COMPLETED', output_data={'tool': 'APOLLO', 'candidates_found': 25, 'status': 'SUCCESS'}),
        AgentRun(campaign_id=camp_2.id, prospect_id=p_ava.id, agent_type='CONVERSATION', status='COMPLETED', output_data={'classification': 'MEETING', 'sentiment': 'POSITIVE'}),
        AgentRun(campaign_id=camp_3.id, prospect_id=p_rohan.id, agent_type='CONVERSATION', status='COMPLETED', output_data={'classification': 'REPLY', 'sentiment': 'INQUISITIVE'}),
    ]
    db.add_all(runs)

    events = [
        OutreachEvent(campaign_id=camp_1.id, prospect_id=freshworks_prospect.id, channel='email', status='SENT', content='Autonomous outbound for engineering-led SaaS teams'),
        OutreachEvent(campaign_id=camp_2.id, prospect_id=p_ava.id, channel='email', status='SENT', content='Engineering productivity workflows'),
        OutreachEvent(campaign_id=camp_3.id, prospect_id=p_rohan.id, channel='email', status='SENT', content='Compliant automated verification at FinBridge'),
        OutreachEvent(campaign_id=camp_3.id, prospect_id=p_isha.id, channel='linkedin', status='SENT', content='Core banking infrastructure modernisation'),
    ]
    db.add_all(events)

    # 12. Knowledge Documents. Campaign-1-scoped documents use category
    # f'campaign_{camp_1.id}' so SimpleRetriever's campaign-scoped retrieval (see
    # app/rag/retriever.py) only surfaces them for Campaign 1 drafts, plus 'global'
    # documents that apply everywhere.
    global_docs = [
        ('Platform Overview & Policy Architecture', 'Our autonomous multi-channel SDR platform uses a deterministic policy engine to enforce working hours, DNC suppression, contact frequency limits, and capacity thresholds before any outreach event can fire.'),
        ('Tone of Voice & Messaging Standards', 'Keep all outbound messages concise (under 80 words), grounded in verified research evidence, and free of hype. Always articulate a clear, friction-free value proposition.'),
    ]
    india_docs = [
        ('India BFSI Playbook: Regulatory & Compliance Governance', 'When communicating with Indian BFSI CIOs, prioritize data residency, RBI guidelines compliance, zero hallucination deterministic policies, and complete audit trails.'),
    ]
    ctos_docs = [
        ('CTO/CIO Buyer Playbook', 'This campaign targets CTOs and CIOs at SaaS and cloud-native companies with 200-5,000 employees. Lead with cloud cost efficiency, engineering velocity, and multi-cloud reliability -- not generic platform features.'),
        ('Case Study: Cloud Infrastructure Modernization', 'A mid-market cloud SaaS company cut infrastructure spend 30% and shipped 2x faster after consolidating its engineering tooling, freeing engineering leadership from manual vendor evaluation cycles.'),
        ('Objection Handling: "We\'re mid-migration already"', 'Position as complementary, not disruptive: integrates alongside an in-flight cloud migration rather than requiring a rip-and-replace, so ongoing modernization work isn\'t blocked.'),
    ]
    hero_docs = [
        ('Product Overview', 'Our platform automates SDR prospecting end to end -- discovery, research, ICP fitment, personalized outreach across email/LinkedIn/SMS/voice, and conversation handling -- while a deterministic policy engine gates every send behind human approval.'),
        ('Enterprise SaaS Case Study', 'A 2,000-employee B2B SaaS company reduced manual prospecting time by 70% after adopting our platform, while keeping every outbound message subject to representative approval and full audit logging.'),
        ('Security / Compliance FAQ', 'Our architecture is air-gapped from third-party LLM training pipelines: no customer or prospect data is ever used to train external models. SOC2 Type II controls cover access, encryption, and audit logging end to end.'),
        ('Sales Playbook: Engineering Productivity', 'When targeting CTOs and VPs of Engineering, highlight autonomous execution, high-signal developer ergonomics, API-driven orchestration, and how the platform removes engineers from manual outbound pipeline work.'),
        ('Objection Handling: "We already have a sales engagement tool"', 'Differentiate on the deterministic policy engine (not just sequencing) and the fact that every send is approval-gated and fully audited -- most engagement tools automate sending, not governance.'),
        ('Example Outreach: CTO / VP Engineering', 'Hi {first_name}, saw {company}\'s recent engineering growth. We help engineering-led SaaS orgs run policy-governed outbound without pulling engineers into pipeline ops. Open to a 10-minute walkthrough?'),
    ]
    db.add_all([KnowledgeDocument(title=t, content=c, category='global') for t, c in global_docs])
    db.add_all([KnowledgeDocument(title=t, content=c, category=f'campaign_{camp_3.id}') for t, c in india_docs])
    db.add_all([KnowledgeDocument(title=t, content=c, category=f'campaign_{camp_1.id}') for t, c in hero_docs])
    db.add_all([KnowledgeDocument(title=t, content=c, category=f'campaign_{camp_2.id}') for t, c in ctos_docs])

    # 13. Prompt Versions
    prompts = [
        PromptVersion(agent_type='qualification', version='1.0.0', prompt_text='Evaluate prospect company profile, funding stage, and technology stack against ICP criteria.'),
        PromptVersion(agent_type='strategy', version='1.0.0', prompt_text='Select the optimal primary outreach channel (Email, LinkedIn, Message, Voice) based on contact role and verified presence.'),
        PromptVersion(agent_type='personalization', version='1.0.0', prompt_text='Draft concise, highly personalized outreach citing verified research signals and recent company milestones.'),
        PromptVersion(agent_type='conversation', version='1.0.0', prompt_text='Classify inbound responses into MEETING_INTENT, INFORMATION_REQUEST, OBJECTION, or NOT_INTERESTED.'),
    ]
    db.add_all(prompts)

    await db.commit()
