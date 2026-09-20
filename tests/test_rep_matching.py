from types import SimpleNamespace

import httpx
import pytest
from sqlalchemy import select

from app.api import manager as manager_api
from app.api.auth import require_manager
from app.db.models import AccessProfile, Campaign, CampaignAssignment, LeadAssignment, User
from app.main import app, assign_campaign_representative
from app.matching.engine import RepMatchEngine


def campaign(**overrides):
    values = dict(name="Campaign", target_industries=["SaaS"], target_roles=["CTO"],
                  target_geography="US", active_channels=["Email", "LinkedIn", "Call"], icp_config={})
    values.update(overrides)
    return SimpleNamespace(**values)


def representative(**overrides):
    values = dict(specialties=["SaaS", "CTO"], regions=["US"],
                  supported_channels=["email", "linkedin", "call"], max_active_leads=20,
                  timezone="America/New_York", working_hours={"start": 9, "end": 17})
    values.update(overrides)
    return SimpleNamespace(**values)


def evaluate(**overrides):
    campaign_overrides = overrides.pop("campaign", {})
    representative_overrides = overrides.pop("representative", {})
    return RepMatchEngine().evaluate(campaign(**campaign_overrides), representative(**representative_overrides),
                                     campaign_working_hours={"start": 9, "end": 17, "timezone": "America/New_York"}, **overrides)


def test_perfect_configuration_match_scores_100():
    result = evaluate()
    assert result["score"] == 100
    assert result["breakdown"] == {"icp_fit": 30, "geography_fit": 20, "channel_fit": 20, "capacity": 15, "specialization": 10, "working_hours": 5}


def test_partial_icp_and_channel_mismatches_are_scored_proportionally():
    result = evaluate(representative={"specialties": ["SaaS"], "supported_channels": ["email"]})
    assert result["breakdown"]["icp_fit"] == 15
    assert result["breakdown"]["channel_fit"] == 7
    assert any("Does not support" in warning for warning in result["warnings"])


def test_geography_mismatch_and_missing_timezone_are_explained():
    mismatch = evaluate(representative={"regions": ["EMEA"]})
    assert mismatch["breakdown"]["geography_fit"] == 6
    assert any("does not match" in warning for warning in mismatch["warnings"])
    missing = evaluate(representative={"timezone": ""})
    assert missing["breakdown"]["working_hours"] == 0
    assert any("timezone is missing" in warning for warning in missing["warnings"])


def test_capacity_thresholds_and_missing_specialization_are_non_blocking():
    near = evaluate(current_load=17)
    assert near["capacity"]["utilization_percentage"] == 85
    assert any("near capacity" in warning for warning in near["warnings"])
    over = evaluate(current_load=21)
    assert over["breakdown"]["capacity"] == 0
    assert any("assignment remains allowed" in warning for warning in over["warnings"])
    unknown = evaluate(representative={"specialties": []})
    assert unknown["breakdown"]["specialization"] == 0
    assert "Specialization fit is unverified" in unknown["warnings"]


def test_multiple_representatives_sort_deterministically():
    engine = RepMatchEngine()
    first = engine.evaluate(campaign(), representative(), campaign_working_hours={"start": 9, "end": 17, "timezone": "America/New_York"})
    second = engine.evaluate(campaign(), representative(regions=["EMEA"], supported_channels=["email"]), campaign_working_hours={"start": 9, "end": 17, "timezone": "America/New_York"})
    ranked = sorted([("b", second), ("a", first)], key=lambda item: (-item[1]["score"], item[0]))
    assert [item[0] for item in ranked] == ["a", "b"]
    assert first == engine.evaluate(campaign(), representative(), campaign_working_hours={"start": 9, "end": 17, "timezone": "America/New_York"})


@pytest.mark.asyncio
async def test_rep_matches_endpoint_requires_manager_and_sorts_active_roster(db):
    manager = User(name="Manager", email="manager@example.test")
    rep_one = User(name="Strong", email="strong@example.test")
    rep_two = User(name="Weak", email="weak@example.test")
    c = Campaign(name="Campaign", target_industries=["SaaS"], target_roles=["CTO"], target_geography="US", active_channels=["email"])
    db.add_all([manager, rep_one, rep_two, c]); await db.flush()
    db.add_all([
        AccessProfile(user_id=manager.id, role="MANAGER"),
        AccessProfile(user_id=rep_one.id, role="REPRESENTATIVE", specialties=["SaaS", "CTO"], regions=["US"], supported_channels=["email"], max_active_leads=10),
        AccessProfile(user_id=rep_two.id, role="REPRESENTATIVE", specialties=[], regions=["EMEA"], supported_channels=[], max_active_leads=10),
    ])
    await db.commit()

    async def session_override():
        yield db

    app.dependency_overrides[manager_api.get_session] = session_override
    transport = httpx.ASGITransport(app=app)
    try:
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            denied = await client.get(f"/api/manager/campaigns/{c.id}/rep-matches", headers={"X-User-Email": rep_one.email})
            allowed = await client.get(f"/api/manager/campaigns/{c.id}/rep-matches", headers={"X-User-Email": manager.email})
        assert denied.status_code == 403
        assert allowed.status_code == 200
        matches = allowed.json()
        assert [match["representative_id"] for match in matches] == [rep_one.id, rep_two.id]
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_over_capacity_representative_can_still_receive_campaign_assignment(db):
    manager = User(name="Manager", email="assign-manager@example.test")
    rep = User(name="Rep", email="assign-rep@example.test")
    c = Campaign(name="Campaign")
    db.add_all([manager, rep, c]); await db.flush()
    db.add_all([AccessProfile(user_id=manager.id, role="MANAGER"), AccessProfile(user_id=rep.id, role="REPRESENTATIVE", max_active_leads=1)])
    await db.commit()
    identity = (manager, (await db.scalar(select(AccessProfile).where(AccessProfile.user_id == manager.id))))
    from app.schemas import CampaignAssignmentIn
    assignment = await assign_campaign_representative(c.id, CampaignAssignmentIn(representative_id=rep.id), db, identity)
    assert assignment["representative_id"] == rep.id
    assert await db.scalar(select(CampaignAssignment).where(CampaignAssignment.representative_id == rep.id))
