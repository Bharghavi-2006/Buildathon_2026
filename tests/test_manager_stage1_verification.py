import uuid
from datetime import datetime, timedelta
import pytest
from httpx import AsyncClient, ASGITransport
from sqlalchemy import select
from app.main import app
from app.db.session import init_db, SessionLocal
from app.seed.data import seed
from app.core.config import settings
from app.db.models import (
    Campaign, Prospect, CampaignProspect, CampaignAssignment, LeadAssignment,
    Conversation, Message, User, AccessProfile, SuppressionEntry,
)

MANAGER = 'manager@demo.local'


async def _ready():
    await init_db()
    async with SessionLocal() as db:
        await seed(db)


async def _client():
    return AsyncClient(transport=ASGITransport(app=app), base_url='http://test')


async def _paused_campaign_with_open_conversation(db, rep_email):
    rep = await db.scalar(select(User).where(User.email == rep_email))
    c = Campaign(name=f'Paused-{uuid.uuid4().hex[:6]}', status='PAUSED', active_channels=['email'], demo_mode=True, demo_recipient_email='demo@example.com')
    p = Prospect(first_name='Open', last_name='Thread', email=f'open-{uuid.uuid4().hex[:8]}@example.com')
    db.add_all([c, p]); await db.flush()
    cp = CampaignProspect(campaign_id=c.id, prospect_id=p.id)
    db.add(cp); await db.flush()
    db.add(CampaignAssignment(campaign_id=c.id, representative_id=rep.id, assigned_by_id=rep.id))
    db.add(LeadAssignment(campaign_prospect_id=cp.id, representative_id=rep.id, assigned_by_id=rep.id, status='ASSIGNED'))
    conv = Conversation(campaign_id=c.id, prospect_id=p.id, status='OPEN')
    db.add(conv); await db.flush()
    db.add(Message(conversation_id=conv.id, direction='INBOUND', channel='email', content='Still interested, following up?'))
    await db.commit()
    return c, p, conv


@pytest.mark.asyncio
async def test_manual_reply_succeeds_on_paused_campaign_open_conversation():
    await _ready()
    async with SessionLocal() as db:
        c, p, conv = await _paused_campaign_with_open_conversation(db, 'alex.mercer@demo.local')
    async with await _client() as client:
        res = await client.post(f'/conversations/{conv.id}/messages', json={'content': 'Thanks for waiting, following up now.'}, headers={'X-User-Email': MANAGER})
        assert res.status_code == 200
        assert res.json()['delivery_mode'] == 'DEMO'


@pytest.mark.asyncio
async def test_manual_reply_still_blocked_by_kill_switch():
    await _ready()
    async with SessionLocal() as db:
        c, p, conv = await _paused_campaign_with_open_conversation(db, 'alex.mercer@demo.local')
    settings().global_kill_switch = True
    try:
        async with await _client() as client:
            res = await client.post(f'/conversations/{conv.id}/messages', json={'content': 'hello'}, headers={'X-User-Email': MANAGER})
            assert res.status_code == 409
            assert res.json()['detail']['code'] == 'GLOBAL_KILL_SWITCH'
    finally:
        settings().global_kill_switch = False


@pytest.mark.asyncio
async def test_manual_reply_still_blocked_by_suppression():
    await _ready()
    async with SessionLocal() as db:
        c, p, conv = await _paused_campaign_with_open_conversation(db, 'alex.mercer@demo.local')
        db.add(SuppressionEntry(prospect_id=p.id, reason='DNC')); await db.commit()
    async with await _client() as client:
        res = await client.post(f'/conversations/{conv.id}/messages', json={'content': 'hello'}, headers={'X-User-Email': MANAGER})
        assert res.status_code == 409
        assert res.json()['detail']['code'] == 'SUPPRESSION'


@pytest.mark.asyncio
async def test_dashboard_open_conversations_count_is_real():
    await _ready()
    async with SessionLocal() as db:
        c, p, conv = await _paused_campaign_with_open_conversation(db, 'alex.mercer@demo.local')
        # a second, closed conversation on the same campaign must not be counted
        p2 = Prospect(first_name='Closed', last_name='Thread', email=f'closed-{uuid.uuid4().hex[:8]}@example.com')
        db.add(p2); await db.flush()
        db.add(Conversation(campaign_id=c.id, prospect_id=p2.id, status='CLOSED'))
        await db.commit()
    async with await _client() as client:
        res = await client.get('/api/manager/dashboard', headers={'X-User-Email': MANAGER})
        card = next(x for x in res.json()['campaigns'] if x['id'] == c.id)
        assert card['open_conversations'] == 1


@pytest.mark.asyncio
async def test_alerts_include_rep_over_capacity_and_suppression_blocked():
    await _ready()
    async with SessionLocal() as db:
        rep = await db.scalar(select(User).where(User.email == 'sarah.kim@demo.local'))
        profile = await db.scalar(select(AccessProfile).where(AccessProfile.user_id == rep.id))
        profile.max_active_leads = 2
        c = Campaign(name=f'CapTest-{uuid.uuid4().hex[:6]}', status='LIVE', active_channels=['email'])
        db.add(c); await db.flush()
        for i in range(2):
            p = Prospect(first_name=f'P{i}', last_name='X', email=f'cap-{uuid.uuid4().hex[:8]}@example.com')
            db.add(p); await db.flush()
            cp = CampaignProspect(campaign_id=c.id, prospect_id=p.id)
            db.add(cp); await db.flush()
            db.add(LeadAssignment(campaign_prospect_id=cp.id, representative_id=rep.id, assigned_by_id=rep.id, status='ASSIGNED'))
        # a suppression-blocked outreach event, materialized into a Hurdle by ensure_hurdles()
        from app.db.models import OutreachEvent
        p3 = Prospect(first_name='Blocked', last_name='One', email=f'blocked-{uuid.uuid4().hex[:8]}@example.com')
        db.add(p3); await db.flush()
        db.add(OutreachEvent(campaign_id=c.id, prospect_id=p3.id, channel='email', status='BLOCKED', content='draft', blocked_reason='Prospect is suppressed'))
        await db.commit()
    async with await _client() as client:
        res = await client.get('/api/manager/alerts', headers={'X-User-Email': MANAGER})
        alerts = res.json()
        assert any(a['type'] == 'REP_OVER_CAPACITY' and 'Sarah Kim' in a['message'] for a in alerts)
        assert any(a['type'] == 'SUPPRESSION_BLOCKED' for a in alerts)


@pytest.mark.asyncio
async def test_campaign_team_endpoint_lists_reps_and_their_leads():
    await _ready()
    async with SessionLocal() as db:
        rep = await db.scalar(select(User).where(User.email == 'james.obrien@demo.local'))
        c = Campaign(name=f'Team-{uuid.uuid4().hex[:6]}', status='LIVE', active_channels=['email'])
        p = Prospect(first_name='Team', last_name='Lead', email=f'team-{uuid.uuid4().hex[:8]}@example.com')
        db.add_all([c, p]); await db.flush()
        cp = CampaignProspect(campaign_id=c.id, prospect_id=p.id, current_stage='CONTACTED')
        db.add(cp); await db.flush()
        db.add(CampaignAssignment(campaign_id=c.id, representative_id=rep.id, assigned_by_id=rep.id))
        db.add(LeadAssignment(campaign_prospect_id=cp.id, representative_id=rep.id, assigned_by_id=rep.id, status='ASSIGNED'))
        db.add(Conversation(campaign_id=c.id, prospect_id=p.id, status='MEETING_INTENT'))
        await db.commit()
        campaign_id = c.id
    async with await _client() as client:
        res = await client.get(f'/api/manager/campaigns/{campaign_id}/team', headers={'X-User-Email': MANAGER})
        assert res.status_code == 200
        team = res.json()
        row = next(r for r in team if r['representative']['email'] == 'james.obrien@demo.local')
        assert len(row['leads']) == 1
        assert row['leads'][0]['prospect']['email'].startswith('team-')
        assert row['leads'][0]['conversation_status'] == 'MEETING_INTENT'


@pytest.mark.asyncio
async def test_prospects_select_respects_manager_chosen_threshold():
    await _ready()
    async with await _client() as client:
        create = await client.post('/api/manager/campaigns', json={'name': f'ThresholdTest-{uuid.uuid4().hex[:6]}'}, headers={'X-User-Email': MANAGER})
        campaign_id = create.json()['id']
        await client.patch(f'/api/manager/campaigns/{campaign_id}/icp', json={'geography': 'US', 'target_roles': ['Nonexistent Role'], 'industries': ['Nonexistent Industry']}, headers={'X-User-Email': MANAGER})
    async with SessionLocal() as db:
        p = Prospect(first_name='Low', last_name='Fit', email=f'lowfit-{uuid.uuid4().hex[:8]}@example.com', title='Random Title', industry='Random Industry')
        db.add(p); await db.commit()
        from app.db.models import ProspectBatch
        batch = ProspectBatch(campaign_id=campaign_id, mode='SEED_LIST', prospect_ids=[p.id], created_by_id=(await db.scalar(select(User).where(User.email == MANAGER))).id, status='APPROVED')
        db.add(batch); await db.commit()
        prospect_id = p.id
    async with await _client() as client:
        # A 0-score prospect should be rejected at the default (60) threshold...
        res_default = await client.post(f'/api/manager/campaigns/{campaign_id}/prospects/select', json={'prospect_ids': [prospect_id]}, headers={'X-User-Email': MANAGER})
        assert prospect_id in [r['prospect_id'] for r in res_default.json()['rejected']]
        # ...but selected when the manager explicitly lowers the threshold to 0.
        res_lowered = await client.post(f'/api/manager/campaigns/{campaign_id}/prospects/select', json={'prospect_ids': [prospect_id], 'min_fit_score': 0}, headers={'X-User-Email': MANAGER})
        assert prospect_id in res_lowered.json()['selected']


@pytest.mark.asyncio
async def test_suppression_crud_persists():
    await _ready()
    async with await _client() as client:
        res_missing = await client.post('/api/manager/suppression', json={'prospect_email': 'nobody@nowhere.invalid'}, headers={'X-User-Email': MANAGER})
        assert res_missing.status_code == 404

        res_add = await client.post('/api/manager/suppression', json={'prospect_email': 'ava.reed@cloudscale.example', 'reason': 'Opted out'}, headers={'X-User-Email': MANAGER})
        assert res_add.status_code == 200
        entry_id = res_add.json()['entry']['id']

        res_list = await client.get('/api/manager/suppression', headers={'X-User-Email': MANAGER})
        assert any(row['entry']['id'] == entry_id for row in res_list.json())

        res_remove = await client.delete(f'/api/manager/suppression/{entry_id}', headers={'X-User-Email': MANAGER})
        assert res_remove.status_code == 200

        res_list_after = await client.get('/api/manager/suppression', headers={'X-User-Email': MANAGER})
        assert not any(row['entry']['id'] == entry_id and row['entry']['active'] for row in res_list_after.json())


@pytest.mark.asyncio
async def test_notification_thresholds_get_and_patch_persist():
    await _ready()
    async with await _client() as client:
        res_get = await client.get('/api/manager/notification-thresholds', headers={'X-User-Email': MANAGER})
        assert res_get.status_code == 200
        assert 'approval_aging_threshold_hours' in res_get.json()

        res_patch = await client.patch('/api/manager/notification-thresholds', json={'approval_aging_threshold_hours': 12, 'capacity_alert_threshold_pct': 75}, headers={'X-User-Email': MANAGER})
        assert res_patch.status_code == 200
        assert res_patch.json() == {'approval_aging_threshold_hours': 12, 'capacity_alert_threshold_pct': 75}
        assert settings().approval_aging_threshold_hours == 12
        assert settings().capacity_alert_threshold_pct == 75
    settings().approval_aging_threshold_hours = 24
    settings().capacity_alert_threshold_pct = 90


@pytest.mark.asyncio
async def test_team_permissions_grant_list_revoke():
    await _ready()
    async with await _client() as client:
        new_email = f'newmgr-{uuid.uuid4().hex[:8]}@demo.local'
        res_grant = await client.post('/api/manager/team-permissions', json={'name': 'New Manager', 'email': new_email}, headers={'X-User-Email': MANAGER})
        assert res_grant.status_code == 200
        new_user_id = res_grant.json()['user']['id']

        res_list = await client.get('/api/manager/team-permissions', headers={'X-User-Email': MANAGER})
        assert any(row['user']['email'] == new_email for row in res_list.json())

        res_self_revoke = await client.delete(f'/api/manager/team-permissions/{(await client.get("/me", headers={"X-User-Email": MANAGER})).json()["user"]["id"]}', headers={'X-User-Email': MANAGER})
        assert res_self_revoke.status_code == 409

        res_revoke = await client.delete(f'/api/manager/team-permissions/{new_user_id}', headers={'X-User-Email': MANAGER})
        assert res_revoke.status_code == 200

        res_list_after = await client.get('/api/manager/team-permissions', headers={'X-User-Email': MANAGER})
        assert not any(row['user']['email'] == new_email and row['profile']['active'] for row in res_list_after.json())


@pytest.mark.asyncio
async def test_monitoring_representatives_includes_active_agent_types():
    await _ready()
    async with await _client() as client:
        res = await client.get('/monitoring/representatives', headers={'X-User-Email': MANAGER})
        assert res.status_code == 200
        for rep in res.json():
            assert 'active_agent_types' in rep and 'paused_agent_types' in rep
        aisha = next(r for r in res.json() if r['user']['email'] == 'aisha@demo.local')
        assert isinstance(aisha['active_agent_types'], list)
