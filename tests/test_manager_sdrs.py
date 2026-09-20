import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.db.session import SessionLocal
from app.db.models import User, AccessProfile, Campaign, CampaignAssignment

@pytest.mark.asyncio
async def test_manager_sdrs_workflow():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Non-manager access is forbidden (403)
        res = await client.get("/team/representatives", headers={"X-User-Email": "aisha@demo.local"})
        assert res.status_code == 403

        # 2. Manager access to representative roster
        res = await client.get("/team/representatives", headers={"X-User-Email": "manager@demo.local"})
        assert res.status_code == 200
        reps = res.json()
        assert len(reps) >= 2
        for r in reps:
            assert "user" in r
            assert "profile" in r
            assert "active_leads" in r
            assert "available_capacity" in r
            assert "active_campaigns_count" in r

        # 3. Monitoring endpoint returns outreach_sent, pending_approvals, aging_approvals
        res_mon = await client.get("/monitoring/representatives", headers={"X-User-Email": "manager@demo.local"})
        assert res_mon.status_code == 200
        mon_reps = res_mon.json()
        assert len(mon_reps) >= 2
        for mr in mon_reps:
            assert "outreach_sent" in mr
            assert "pending_approvals" in mr
            assert "aging_approvals" in mr

        # 4. Detail endpoint for an existing representative
        rep_id = reps[0]["user"]["id"]
        res_detail = await client.get(f"/team/representatives/{rep_id}", headers={"X-User-Email": "manager@demo.local"})
        assert res_detail.status_code == 200
        detail = res_detail.json()
        assert detail["user"]["id"] == rep_id
        assert "campaign_assignments" in detail
        assert "approvals" in detail
        assert "pending_count" in detail["approvals"]
        assert "aging_count" in detail["approvals"]

        # 5. Patch representative capacity and active state
        res_patch = await client.patch(
            f"/team/representatives/{rep_id}",
            json={"max_active_leads": 45, "active": True},
            headers={"X-User-Email": "manager@demo.local"}
        )
        assert res_patch.status_code == 200
        assert res_patch.json()["profile"]["max_active_leads"] == 45
        assert res_patch.json()["profile"]["active"] is True

        # 6. Create new representative
        import uuid
        new_email = f"test.sdr.{uuid.uuid4().hex[:8]}@demo.local"
        res_create = await client.post(
            "/team/representatives",
            json={
                "name": "Test Representative",
                "email": new_email,
                "max_active_leads": 30,
                "specialties": ["Enterprise SaaS", "Security"],
                "regions": ["US", "Global"],
                "supported_channels": ["email", "linkedin"],
                "timezone": "America/New_York",
                "working_hours": {"start": 9, "end": 17}
            },
            headers={"X-User-Email": "manager@demo.local"}
        )
        assert res_create.status_code == 200
        created = res_create.json()
        assert created["user"]["email"] == new_email
        assert created["profile"]["max_active_leads"] == 30
