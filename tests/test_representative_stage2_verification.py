import uuid
import pytest
from httpx import AsyncClient, ASGITransport
from sqlalchemy import select
from app.main import app
from app.db.session import init_db, SessionLocal
from app.seed.data import seed
from app.core.config import settings
from app.db.models import (
    Campaign, Prospect, CampaignProspect, CampaignAssignment, LeadAssignment,
    Conversation, User, ApprovalRequest, CampaignChannelSettings,
)

MANAGER = 'manager@demo.local'


async def _ready():
    await init_db()
    async with SessionLocal() as db:
        await seed(db)


async def _client():
    return AsyncClient(transport=ASGITransport(app=app), base_url='http://test')


async def _live_campaign_with_lead(db, rep_email, channels, *, demo_mode=True, demo_recipient_email='demo@example.com', linkedin_url='', phone=''):
    rep = await db.scalar(select(User).where(User.email == rep_email))
    c = Campaign(name=f'Stage2-{uuid.uuid4().hex[:6]}', status='LIVE', active_channels=channels, demo_mode=demo_mode, demo_recipient_email=demo_recipient_email)
    p = Prospect(first_name='Jordan', last_name='Prospect', email=f'jordan-{uuid.uuid4().hex[:8]}@example.com', title='VP Sales', industry='SaaS', linkedin_url=linkedin_url, phone=phone)
    db.add_all([c, p]); await db.flush()
    for ch in channels:
        db.add(CampaignChannelSettings(campaign_id=c.id, channel=ch, enabled=True, daily_limit=25))
    cp = CampaignProspect(campaign_id=c.id, prospect_id=p.id, qualification_score=77, qualification_reason='Role match')
    db.add(cp); await db.flush()
    db.add(CampaignAssignment(campaign_id=c.id, representative_id=rep.id, assigned_by_id=rep.id))
    db.add(LeadAssignment(campaign_prospect_id=cp.id, representative_id=rep.id, assigned_by_id=rep.id, status='ASSIGNED'))
    await db.commit()
    return c, p, cp, rep


@pytest.mark.asyncio
async def test_generate_drafts_creates_approval_visible_to_rep_with_fit_score():
    await _ready()
    async with SessionLocal() as db:
        c, p, cp, rep = await _live_campaign_with_lead(db, 'aisha@demo.local', ['email'])
        campaign_id, rep_email = c.id, rep.email
    async with await _client() as client:
        res = await client.post(f'/api/manager/campaigns/{campaign_id}/generate-drafts', json={'channel': 'email', 'limit': 5}, headers={'X-User-Email': MANAGER})
        assert res.status_code == 200
        assert p.id in res.json()['drafted']
        approvals = await client.get('/api/rep/approvals', headers={'X-User-Email': rep_email})
        item = next(a for a in approvals.json() if a['campaign']['id'] == campaign_id)
        assert item['channel'] == 'email'
        assert item['fit_score'] == 77
        assert item['fit_reason'] == 'Role match'
        assert item['generated_message']


@pytest.mark.asyncio
async def test_generate_drafts_rejects_channel_not_active_for_campaign():
    await _ready()
    async with SessionLocal() as db:
        c, p, cp, rep = await _live_campaign_with_lead(db, 'aisha@demo.local', ['email'])
        campaign_id = c.id
    async with await _client() as client:
        res = await client.post(f'/api/manager/campaigns/{campaign_id}/generate-drafts', json={'channel': 'sms', 'limit': 5}, headers={'X-User-Email': MANAGER})
        assert res.status_code == 409


@pytest.mark.asyncio
async def test_generate_drafts_skips_prospect_without_channel_contact_info():
    await _ready()
    async with SessionLocal() as db:
        c, p, cp, rep = await _live_campaign_with_lead(db, 'aisha@demo.local', ['linkedin'], linkedin_url='')
        campaign_id = c.id
    async with await _client() as client:
        res = await client.post(f'/api/manager/campaigns/{campaign_id}/generate-drafts', json={'channel': 'linkedin', 'limit': 5}, headers={'X-User-Email': MANAGER})
        assert res.status_code == 200
        body = res.json()
        assert body['drafted'] == []
        assert body['skipped'][0]['prospect_id'] == p.id


@pytest.mark.asyncio
async def test_linkedin_sender_bot_draft_uses_linkedin_copy_and_delivers_to_linkedin_url():
    await _ready()
    async with SessionLocal() as db:
        c, p, cp, rep = await _live_campaign_with_lead(db, 'aisha@demo.local', ['linkedin'], demo_mode=False, linkedin_url='https://linkedin.com/in/jordanprospect')
        campaign_id, rep_email = c.id, rep.email
    async with await _client() as client:
        gen = await client.post(f'/api/manager/campaigns/{campaign_id}/generate-drafts', json={'channel': 'linkedin', 'limit': 5}, headers={'X-User-Email': MANAGER})
        assert p.id in gen.json()['drafted']
        approvals = await client.get('/api/rep/approvals', headers={'X-User-Email': rep_email})
        item = next(a for a in approvals.json() if a['campaign']['id'] == campaign_id)
        assert item['channel'] == 'linkedin'
        assert 'LinkedIn' in item['generated_message']
        approve = await client.post(f"/api/rep/approvals/{item['id']}/approve", headers={'X-User-Email': rep_email})
        assert approve.status_code == 200
        result = approve.json()
        assert result['allowed'] is True
        assert result['delivery']['actual_recipient'] == 'https://linkedin.com/in/jordanprospect'
        assert result['delivery']['mode'] == 'LIVE'


@pytest.mark.asyncio
async def test_sms_channel_delivery_blocked_when_prospect_has_no_phone():
    await _ready()
    async with SessionLocal() as db:
        c, p, cp, rep = await _live_campaign_with_lead(db, 'aisha@demo.local', ['message'], demo_mode=False, phone='')
        approval = ApprovalRequest(campaign_id=c.id, campaign_prospect_id=cp.id, representative_id=rep.id, request_type='OUTREACH', payload={'channel': 'message', 'message': 'Hi there, quick question about your stack.'})
        db.add(approval); await db.commit()
        approval_id, rep_email = approval.id, rep.email
    async with await _client() as client:
        res = await client.post(f'/api/rep/approvals/{approval_id}/approve', headers={'X-User-Email': rep_email})
        assert res.status_code == 200
        body = res.json()
        assert body['allowed'] is False
        assert body['reason_code'] == 'DELIVERY_CONFIGURATION'
        assert 'phone number' in body['message']


@pytest.mark.asyncio
async def test_rep_workspace_reports_channel_status_and_campaign_conflict_flag():
    await _ready()
    async with SessionLocal() as db:
        rep = await db.scalar(select(User).where(User.email == 'aisha@demo.local'))
        c1, p1, cp1, _ = await _live_campaign_with_lead(db, 'aisha@demo.local', ['email', 'linkedin'])
        # A second LIVE campaign already contacting the same prospect creates a real conflict.
        c2 = Campaign(name=f'Conflict-{uuid.uuid4().hex[:6]}', status='LIVE', active_channels=['email'])
        db.add(c2); await db.flush()
        from datetime import datetime
        cp2 = CampaignProspect(campaign_id=c2.id, prospect_id=p1.id, last_contacted_at=datetime.utcnow())
        db.add(cp2); await db.commit()
        rep_email, campaign_id = rep.email, c1.id
    async with await _client() as client:
        res = await client.get('/api/rep/workspace', headers={'X-User-Email': rep_email})
        assert res.status_code == 200
        data = res.json()
        channels = {row['channel']: row['live'] for row in data['metrics']['channel_status']}
        assert channels['email'] is True
        assert channels['linkedin'] is True
        card = next(c for c in data['campaigns'] if c['campaign']['id'] == campaign_id)
        assert card['has_conflict'] is True


@pytest.mark.asyncio
async def test_rep_approval_context_drawer_returns_agent_and_rag_context():
    await _ready()
    async with SessionLocal() as db:
        c, p, cp, rep = await _live_campaign_with_lead(db, 'aisha@demo.local', ['email'])
        approval = ApprovalRequest(campaign_id=c.id, campaign_prospect_id=cp.id, representative_id=rep.id, request_type='OUTREACH', payload={'channel': 'email', 'message': 'hi', 'agent': 'PERSONALIZATION'})
        db.add(approval); await db.commit()
        approval_id, rep_email = approval.id, rep.email
    async with await _client() as client:
        res = await client.get(f'/api/rep/approvals/{approval_id}/context', headers={'X-User-Email': rep_email})
        assert res.status_code == 200
        body = res.json()
        assert body['agent'] == 'PERSONALIZATION'
        assert isinstance(body['rag_context'], list)


@pytest.mark.asyncio
async def test_rep_cannot_reply_on_conversation_outside_their_campaign_assignment():
    await _ready()
    async with SessionLocal() as db:
        other_rep = await db.scalar(select(User).where(User.email == 'vikram@demo.local'))
        c = Campaign(name=f'NotMine-{uuid.uuid4().hex[:6]}', status='LIVE', active_channels=['email'], demo_mode=True, demo_recipient_email='demo@example.com')
        p = Prospect(first_name='Not', last_name='Assigned', email=f'notmine-{uuid.uuid4().hex[:8]}@example.com')
        db.add_all([c, p]); await db.flush()
        conv = Conversation(campaign_id=c.id, prospect_id=p.id, status='OPEN')
        db.add(conv); await db.commit()
        conv_id = conv.id
    async with await _client() as client:
        res = await client.post(f'/conversations/{conv_id}/messages', json={'content': 'hello'}, headers={'X-User-Email': 'aisha@demo.local'})
        assert res.status_code == 403


@pytest.mark.asyncio
async def test_seeded_rep_workspace_has_no_duplicate_campaign_assignments():
    await _ready()
    async with await _client() as client:
        for email in ['aisha@demo.local', 'vikram@demo.local', 'alex.mercer@demo.local']:
            res = await client.get('/api/rep/workspace', headers={'X-User-Email': email})
            ids = [c['campaign']['id'] for c in res.json()['campaigns']]
            assert len(ids) == len(set(ids)), f'{email} has duplicate campaign assignments: {ids}'


@pytest.mark.asyncio
async def test_rep_can_reply_on_conversation_within_their_campaign_assignment():
    await _ready()
    async with SessionLocal() as db:
        c, p, cp, rep = await _live_campaign_with_lead(db, 'aisha@demo.local', ['email'])
        conv = Conversation(campaign_id=c.id, prospect_id=p.id, status='OPEN')
        db.add(conv); await db.commit()
        conv_id, rep_email = conv.id, rep.email
    async with await _client() as client:
        res = await client.post(f'/conversations/{conv_id}/messages', json={'content': 'Following up on your question.'}, headers={'X-User-Email': rep_email})
        assert res.status_code == 200
