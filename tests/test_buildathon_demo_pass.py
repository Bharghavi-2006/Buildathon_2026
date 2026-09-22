import pytest
from httpx import AsyncClient, ASGITransport
from sqlalchemy import select
from app.main import app
from app.db.session import init_db, SessionLocal
from app.seed.data import seed
from app.db.models import Campaign, CampaignProspect, ApprovalRequest

MANAGER = 'manager@demo.local'


async def _ready():
    await init_db()
    async with SessionLocal() as db:
        await seed(db)


async def _client():
    return AsyncClient(transport=ASGITransport(app=app), base_url='http://test')


async def _hero_campaign(db):
    return await db.scalar(select(Campaign).where(Campaign.name == 'US Enterprise SaaS Engineering Leaders'))


@pytest.mark.asyncio
async def test_exactly_three_campaigns_with_expected_names_and_statuses():
    await _ready()
    async with await _client() as client:
        res = await client.get('/api/manager/dashboard', headers={'X-User-Email': MANAGER})
        cards = {c['name']: c['status'] for c in res.json()['campaigns']}
        assert cards == {
            'US Enterprise SaaS Engineering Leaders': 'LIVE',
            'US SaaS Enterprise CTOs': 'LIVE',
            'India BFSI Digital Transformation Leaders': 'PAUSED',
        }


@pytest.mark.asyncio
async def test_hero_campaign_funnel_matches_the_spec_exactly():
    await _ready()
    async with SessionLocal() as db:
        camp = await _hero_campaign(db)
        cps = (await db.scalars(select(CampaignProspect).where(CampaignProspect.campaign_id == camp.id))).all()
        assert len(cps) == 10  # DISCOVERED: 10
        researched = [cp for cp in cps if cp.current_stage != 'DISCOVERED']
        assert len(researched) == 8  # RESEARCHED: 8
        qualified = [cp for cp in cps if cp.qualification_status == 'QUALIFIED']
        assert len(qualified) == 6  # QUALIFIED: 6
        approvals = (await db.scalars(select(ApprovalRequest).where(ApprovalRequest.campaign_id == camp.id))).all()
        assert len(approvals) == 3  # OUTREACH READY: 3
        pending = [a for a in approvals if a.status == 'PENDING']
        assert len(pending) == 2  # PENDING APPROVAL: 2
        sent = [a for a in approvals if a.status == 'SENT']
        assert len(sent) == 1  # CONTACTED: 1


@pytest.mark.asyncio
async def test_hero_campaign_qualified_prospects_score_strong_fit():
    await _ready()
    async with SessionLocal() as db:
        camp = await _hero_campaign(db)
        from app.db.models import ProspectFitment
        fitments = (await db.scalars(select(ProspectFitment).where(ProspectFitment.campaign_id == camp.id))).all()
        qualifying = [f for f in fitments if f.overall_fit_status == 'STRONG_FIT']
        assert len(qualifying) == 6
        for f in qualifying:
            assert 80 <= f.overall_fit_score <= 100
        disqualified = [f for f in fitments if f.overall_fit_status != 'STRONG_FIT']
        assert len(disqualified) == 2
        for f in disqualified:
            assert f.overall_fit_score < 80


@pytest.mark.asyncio
async def test_freshworks_prospect_conflicts_between_hero_and_second_campaign():
    await _ready()
    async with SessionLocal() as db:
        from app.api.manager import fit
        camp_2 = await db.scalar(select(Campaign).where(Campaign.name == 'US SaaS Enterprise CTOs'))
        from app.db.models import Prospect
        priya = await db.scalar(select(Prospect).where(Prospect.first_name == 'Priya', Prospect.last_name == 'Nair'))
        result = await fit(db, camp_2, priya)
        assert any(c['blocking'] for c in result['conflicts'])
        assert any('US Enterprise SaaS Engineering Leaders' == c['campaign_name'] for c in result['conflicts'])


@pytest.mark.asyncio
async def test_campaign_prospects_endpoint_surfaces_conflict_flag():
    await _ready()
    async with SessionLocal() as db:
        camp_2 = await db.scalar(select(Campaign).where(Campaign.name == 'US SaaS Enterprise CTOs'))
        campaign_2_id = camp_2.id
    async with await _client() as client:
        res = await client.get(f'/campaigns/{campaign_2_id}/prospects', headers={'X-User-Email': MANAGER})
        rows = res.json()
        priya_row = next(r for r in rows if r['prospect']['first_name'] == 'Priya' and r['prospect']['last_name'] == 'Nair')
        assert priya_row['conflict'] is not None
        assert priya_row['conflict']['other_campaign_name'] == 'US Enterprise SaaS Engineering Leaders'
        ava_row = next(r for r in rows if r['prospect']['first_name'] == 'Ava')
        assert ava_row['conflict'] is None


@pytest.mark.asyncio
async def test_paused_campaign_3_has_open_conversations_and_does_not_affect_others():
    await _ready()
    async with await _client() as client:
        res = await client.get('/api/manager/dashboard', headers={'X-User-Email': MANAGER})
        cards = {c['name']: c for c in res.json()['campaigns']}
        india = cards['India BFSI Digital Transformation Leaders']
        assert india['status'] == 'PAUSED'
        assert india['open_conversations'] >= 1
        assert cards['US Enterprise SaaS Engineering Leaders']['status'] == 'LIVE'
        assert cards['US SaaS Enterprise CTOs']['status'] == 'LIVE'


@pytest.mark.asyncio
async def test_aisha_rep_match_score_for_hero_campaign_is_97_with_documented_breakdown():
    await _ready()
    async with SessionLocal() as db:
        camp = await _hero_campaign(db)
        campaign_id = camp.id
    async with await _client() as client:
        res = await client.get(f'/api/manager/campaigns/{campaign_id}/rep-matches', headers={'X-User-Email': MANAGER})
        aisha = next(r for r in res.json() if r['representative']['name'] == 'Aisha Rep')
        assert aisha['score'] == 97
        assert aisha['breakdown'] == {'icp_fit': 30, 'geography_fit': 20, 'channel_fit': 20, 'capacity': 12, 'specialization': 10, 'working_hours': 5}
        assert len(aisha['reasons']) > 0


@pytest.mark.asyncio
async def test_demo_voice_call_creates_transcript_and_respects_policy():
    await _ready()
    async with SessionLocal() as db:
        camp = await _hero_campaign(db)
        from app.db.models import Prospect
        naomi = await db.scalar(select(Prospect).where(Prospect.first_name == 'Naomi'))
        campaign_id, prospect_id = camp.id, naomi.id
    async with await _client() as client:
        res = await client.post(f'/api/manager/campaigns/{campaign_id}/prospects/{prospect_id}/demo-voice-call', headers={'X-User-Email': MANAGER})
        assert res.status_code == 200
        body = res.json()
        assert body['call_status'] == 'DEMO_CONNECTED'
        assert body['intent'] == 'INTERESTED'
        assert body['outcome'] == 'FOLLOW_UP_REQUIRED'
        assert body['policy'] == 'ALLOW'
        assert body['human_escalation'] is False
        assert len(body['transcript']) == 3


@pytest.mark.asyncio
async def test_demo_voice_call_blocked_by_global_kill_switch():
    await _ready()
    from app.core.config import settings
    async with SessionLocal() as db:
        camp = await _hero_campaign(db)
        from app.db.models import Prospect
        naomi = await db.scalar(select(Prospect).where(Prospect.first_name == 'Naomi'))
        campaign_id, prospect_id = camp.id, naomi.id
    settings().global_kill_switch = True
    try:
        async with await _client() as client:
            res = await client.post(f'/api/manager/campaigns/{campaign_id}/prospects/{prospect_id}/demo-voice-call', headers={'X-User-Email': MANAGER})
            assert res.status_code == 409
            assert res.json()['detail']['code'] == 'GLOBAL_KILL_SWITCH'
    finally:
        settings().global_kill_switch = False


@pytest.mark.asyncio
async def test_generate_drafts_persists_campaign_scoped_rag_context():
    await _ready()
    async with SessionLocal() as db:
        camp = await _hero_campaign(db)
        campaign_id = camp.id
    async with await _client() as client:
        gen = await client.post(f'/api/manager/campaigns/{campaign_id}/generate-drafts', json={'channel': 'linkedin', 'limit': 5}, headers={'X-User-Email': MANAGER})
        assert gen.status_code == 200
    async with SessionLocal() as db:
        approvals = (await db.scalars(select(ApprovalRequest).where(ApprovalRequest.campaign_id == campaign_id))).all()
        newest = max(approvals, key=lambda a: a.created_at)
        assert 'rag_context' in newest.payload
        assert isinstance(newest.payload['rag_context'], list)
        # Hero-campaign-scoped docs (not India BFSI's campaign-scoped doc) should be eligible.
        titles = {d['title'] for d in newest.payload['rag_context']}
        assert not titles.intersection({'India BFSI Playbook: Regulatory & Compliance Governance'})


@pytest.mark.asyncio
async def test_rag_retrieval_is_campaign_scoped():
    await _ready()
    async with SessionLocal() as db:
        from app.rag.retriever import SimpleRetriever
        camp = await _hero_campaign(db)
        india = await db.scalar(select(Campaign).where(Campaign.name == 'India BFSI Digital Transformation Leaders'))
        hero_docs = await SimpleRetriever().retrieve(db, 'compliance audit engineering SaaS platform', limit=10, campaign_id=camp.id)
        india_docs = await SimpleRetriever().retrieve(db, 'compliance audit engineering SaaS platform', limit=10, campaign_id=india.id)
        hero_titles = {d['title'] for d in hero_docs}
        india_titles = {d['title'] for d in india_docs}
        assert 'Product Overview' in hero_titles
        assert 'Product Overview' not in india_titles
        assert 'India BFSI Playbook: Regulatory & Compliance Governance' in india_titles
        assert 'India BFSI Playbook: Regulatory & Compliance Governance' not in hero_titles
