import uuid
from datetime import datetime, timedelta
import pytest
from httpx import AsyncClient, ASGITransport
from sqlalchemy import select
from app.main import app
from app.db.session import init_db, SessionLocal
from app.seed.data import seed
from app.core.config import settings
from app.policy.engine import PolicyEngine
from app.db.models import (
    Campaign, Prospect, CampaignProspect, CampaignAssignment, LeadAssignment,
    CampaignChannelSettings, CampaignAgent, OutreachEvent, ApprovalRequest,
    AgentRun, Hurdle, KnowledgeGapFlag, User, AccessProfile, Conversation, Message,
)

ALEX = 'alex.mercer@demo.local'
MAYA = 'maya.patel@demo.local'
MANAGER = 'manager@demo.local'

async def _ready():
    await init_db()
    async with SessionLocal() as db:
        await seed(db)

async def _client():
    return AsyncClient(transport=ASGITransport(app=app), base_url='http://test')

async def _make_blocked_outreach(db, rep_email):
    rep = await db.scalar(select(User).where(User.email == rep_email))
    c = Campaign(name=f'HurdleCampaign-{uuid.uuid4().hex[:6]}', status='LIVE', active_channels=['email'], daily_outreach_limit=25)
    p = Prospect(first_name='Test', last_name='Hurdle', email=f'hurdle-{uuid.uuid4().hex[:8]}@example.com')
    db.add_all([c, p]); await db.flush()
    cp = CampaignProspect(campaign_id=c.id, prospect_id=p.id)
    db.add(cp); await db.flush()
    db.add(CampaignAssignment(campaign_id=c.id, representative_id=rep.id, assigned_by_id=rep.id))
    db.add(LeadAssignment(campaign_prospect_id=cp.id, representative_id=rep.id, assigned_by_id=rep.id, status='ASSIGNED'))
    db.add(OutreachEvent(campaign_id=c.id, prospect_id=p.id, channel='email', status='BLOCKED', content='draft', blocked_reason='Prospect is suppressed'))
    await db.commit()
    return c, p, rep

@pytest.mark.asyncio
async def test_rep_sees_only_own_hurdles_and_cannot_access_others():
    await _ready()
    async with SessionLocal() as db:
        c, p, alex = await _make_blocked_outreach(db, ALEX)
    async with await _client() as client:
        res = await client.get('/api/rep/hurdles', headers={'X-User-Email': ALEX})
        assert res.status_code == 200
        own_ids = {h['id'] for h in res.json()}
        assert len(own_ids) >= 1
        assert all(h['category'] for h in res.json())

        res_other = await client.get('/api/rep/hurdles', headers={'X-User-Email': MAYA})
        assert res_other.status_code == 200
        other_ids = {h['id'] for h in res_other.json()}
        assert own_ids.isdisjoint(other_ids)

        # 2. Rep cannot access another rep's hurdle directly by id.
        hurdle_id = next(h['id'] for h in res.json() if h['category'] == 'SUPPRESSION_DNC')
        res_denied = await client.get(f'/api/rep/hurdles/{hurdle_id}', headers={'X-User-Email': MAYA})
        assert res_denied.status_code == 404
        res_denied_resolve = await client.post(f'/api/rep/hurdles/{hurdle_id}/resolve', json={'note': 'x'}, headers={'X-User-Email': MAYA})
        assert res_denied_resolve.status_code == 404

        res_owner = await client.get(f'/api/rep/hurdles/{hurdle_id}', headers={'X-User-Email': ALEX})
        assert res_owner.status_code == 200
        detail = res_owner.json()
        assert detail['category'] == 'SUPPRESSION_DNC'
        assert detail['status'] == 'ESCALATED'

@pytest.mark.asyncio
async def test_kill_switch_disables_outbound_actions():
    await _ready()
    async with SessionLocal() as db:
        result = await PolicyEngine().check(db, await db.scalar(select(Campaign).where(Campaign.status == 'LIVE')), (await db.scalar(select(Prospect))).id, 'email')
    settings().global_kill_switch = True
    try:
        async with SessionLocal() as db:
            campaign = await db.scalar(select(Campaign).where(Campaign.status == 'LIVE'))
            prospect = await db.scalar(select(Prospect))
            result = await PolicyEngine().check(db, campaign, prospect.id, 'email')
        assert not result.allowed and result.rule == 'GLOBAL_KILL_SWITCH'
    finally:
        settings().global_kill_switch = False

@pytest.mark.asyncio
async def test_campaign_pause_blocks_new_outbound_activity():
    await _ready()
    async with SessionLocal() as db:
        c = Campaign(name='PausedCo', status='PAUSED', active_channels=['email'])
        p = Prospect(first_name='P', last_name='X', email=f'pause-{uuid.uuid4().hex[:8]}@example.com')
        db.add_all([c, p]); await db.flush()
        db.add(CampaignProspect(campaign_id=c.id, prospect_id=p.id)); await db.commit()
        result = await PolicyEngine().check(db, c, p.id, 'email')
        assert not result.allowed and result.rule == 'CAMPAIGN_PAUSED'

@pytest.mark.asyncio
async def test_open_conversation_remains_accessible_during_campaign_pause():
    await _ready()
    async with await _client() as client:
        campaigns_res = await client.get('/api/manager/campaigns', headers={'X-User-Email': MANAGER})
        paused = next(c for c in campaigns_res.json() if c['status'] == 'PAUSED')
        convs = await client.get(f"/campaigns/{paused['id']}/conversations", headers={'X-User-Email': MANAGER})
        assert convs.status_code == 200
        open_convs = [c for c in convs.json() if c['status'] == 'OPEN']
        assert open_convs, 'seed data should have an open conversation on the paused campaign'
        messages = await client.get(f"/conversations/{open_convs[0]['id']}/messages", headers={'X-User-Email': MANAGER})
        assert messages.status_code == 200
        assert len(messages.json()) >= 1

@pytest.mark.asyncio
async def test_daily_limit_is_enforced():
    await _ready()
    async with SessionLocal() as db:
        c = Campaign(name='LimitCo', status='LIVE', active_channels=['email'], daily_outreach_limit=1)
        p1 = Prospect(first_name='A', last_name='A', email=f'lim1-{uuid.uuid4().hex[:8]}@example.com')
        p2 = Prospect(first_name='B', last_name='B', email=f'lim2-{uuid.uuid4().hex[:8]}@example.com')
        db.add_all([c, p1, p2]); await db.flush()
        db.add_all([CampaignProspect(campaign_id=c.id, prospect_id=p1.id), CampaignProspect(campaign_id=c.id, prospect_id=p2.id)])
        db.add(OutreachEvent(campaign_id=c.id, prospect_id=p1.id, channel='email', status='SENT', content='hi'))
        await db.commit()
        result = await PolicyEngine().check(db, c, p2.id, 'email')
        assert not result.allowed and result.rule == 'CAMPAIGN_DAILY_LIMIT'

@pytest.mark.asyncio
async def test_working_hours_are_enforced():
    await _ready()
    async with SessionLocal() as db:
        c = Campaign(name='HoursCo', status='LIVE', active_channels=['email'])
        p = Prospect(first_name='H', last_name='H', email=f'hours-{uuid.uuid4().hex[:8]}@example.com')
        db.add_all([c, p]); await db.flush()
        db.add(CampaignProspect(campaign_id=c.id, prospect_id=p.id))
        db.add(CampaignChannelSettings(campaign_id=c.id, channel='email', enabled=True, working_hours={'start': 0, 'end': 0}))
        await db.commit()
        result = await PolicyEngine().check(db, c, p.id, 'email')
        assert not result.allowed and result.rule == 'OUTSIDE_WORKING_HOURS'

@pytest.mark.asyncio
async def test_suppressed_prospect_cannot_be_contacted():
    await _ready()
    from app.db.models import SuppressionEntry
    async with SessionLocal() as db:
        c = Campaign(name='SuppressCo', status='LIVE', active_channels=['email'])
        p = Prospect(first_name='S', last_name='S', email=f'sup-{uuid.uuid4().hex[:8]}@example.com')
        db.add_all([c, p]); await db.flush()
        db.add_all([CampaignProspect(campaign_id=c.id, prospect_id=p.id), SuppressionEntry(prospect_id=p.id, reason='DNC')])
        await db.commit()
        result = await PolicyEngine().check(db, c, p.id, 'email')
        assert not result.allowed and result.rule == 'SUPPRESSION'

@pytest.mark.asyncio
async def test_campaign_conflict_is_visible_in_guardrails():
    await _ready()
    async with SessionLocal() as db:
        rep = await db.scalar(select(User).where(User.email == ALEX))
        c1 = Campaign(name='ConflictHome', status='LIVE', active_channels=['email'], daily_outreach_limit=25)
        c2 = Campaign(name='ConflictOther', status='LIVE', active_channels=['email'])
        p = Prospect(first_name='Con', last_name='Flict', email=f'conf-{uuid.uuid4().hex[:8]}@example.com')
        db.add_all([c1, c2, p]); await db.flush()
        cp1 = CampaignProspect(campaign_id=c1.id, prospect_id=p.id)
        cp2 = CampaignProspect(campaign_id=c2.id, prospect_id=p.id, last_contacted_at=datetime.utcnow())
        db.add_all([cp1, cp2]); await db.flush()
        db.add(CampaignAssignment(campaign_id=c1.id, representative_id=rep.id, assigned_by_id=rep.id, active=True))
        db.add(LeadAssignment(campaign_prospect_id=cp1.id, representative_id=rep.id, assigned_by_id=rep.id, status='ASSIGNED'))
        await db.commit()
    async with await _client() as client:
        res = await client.get('/api/rep/guardrails', headers={'X-User-Email': ALEX})
        assert res.status_code == 200
        data = res.json()
        card = next(c for c in data['campaigns'] if c['campaign']['name'] == 'ConflictHome')
        assert card['conflicts'], 'expected a visible cross-campaign conflict'
        assert card['conflicts'][0]['other_campaign_name'] == 'ConflictOther'

@pytest.mark.asyncio
async def test_escalation_persists_and_is_visible_to_manager():
    await _ready()
    async with SessionLocal() as db:
        c, p, alex = await _make_blocked_outreach(db, ALEX)
    async with await _client() as client:
        hurdles = (await client.get('/api/rep/hurdles', headers={'X-User-Email': ALEX})).json()
        hurdle_id = hurdles[0]['id']
        esc = await client.post(f'/api/rep/hurdles/{hurdle_id}/escalate', headers={'X-User-Email': ALEX})
        assert esc.status_code == 200
        assert esc.json()['escalated_to_manager'] is True

    async with SessionLocal() as db:
        h = await db.get(Hurdle, hurdle_id)
        assert h.escalated_to_manager is True and h.escalated_at is not None

    async with await _client() as client:
        alerts = await client.get('/api/manager/alerts', headers={'X-User-Email': MANAGER})
        assert alerts.status_code == 200
        assert any(a['type'] == 'HURDLE_ESCALATED' and a['id'] == hurdle_id for a in alerts.json())

@pytest.mark.asyncio
async def test_knowledge_gap_flag_persists():
    await _ready()
    async with SessionLocal() as db:
        c, p, alex = await _make_blocked_outreach(db, ALEX)
        run = AgentRun(campaign_id=c.id, prospect_id=p.id, agent_type='PERSONALIZATION', status='FAILED', output_data={'error': 'No verified research available'})
        db.add(run); await db.commit()
    async with await _client() as client:
        hurdles = (await client.get('/api/rep/hurdles', headers={'X-User-Email': ALEX})).json()
        missing_knowledge = next(h for h in hurdles if h['category'] == 'MISSING_KNOWLEDGE')
        flag_res = await client.post(f"/api/rep/hurdles/{missing_knowledge['id']}/flag-knowledge-gap", headers={'X-User-Email': ALEX})
        assert flag_res.status_code == 200
        assert flag_res.json()['count_this_week'] >= 1
    async with SessionLocal() as db:
        flags = (await db.scalars(select(KnowledgeGapFlag).where(KnowledgeGapFlag.campaign_id == c.id))).all()
        assert len(flags) == 1

@pytest.mark.asyncio
async def test_guardrails_returns_correct_current_state():
    await _ready()
    async with await _client() as client:
        res = await client.get('/api/rep/guardrails', headers={'X-User-Email': ALEX})
        assert res.status_code == 200
        data = res.json()
        assert data['kill_switch']['active'] is False
        assert 'daily_capacity' in data and 'used' in data['daily_capacity'] and 'limit' in data['daily_capacity']
        assert len(data['campaigns']) >= 1
        for card in data['campaigns']:
            assert card['campaign']['status'] in ('DRAFT', 'LIVE', 'PAUSED', 'COMPLETED', 'ARCHIVED')
            for ch in card['channels']:
                assert 'availability' in ch and 'daily_used' in ch and 'daily_limit' in ch

    settings().global_kill_switch = True
    try:
        async with await _client() as client:
            res = await client.get('/api/rep/guardrails', headers={'X-User-Email': ALEX})
            data = res.json()
            assert data['kill_switch']['active'] is True
            assert data['kill_switch']['message']
            for card in data['campaigns']:
                for ch in card['channels']:
                    assert ch['availability'] == 'BLOCKED_KILL_SWITCH'
    finally:
        settings().global_kill_switch = False
