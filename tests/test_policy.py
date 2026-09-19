import pytest
from app.db.models import Campaign, Prospect, CampaignProspect
from app.policy.engine import PolicyEngine
@pytest.mark.asyncio
async def test_paused_campaign_is_blocked(db):
    c=Campaign(name='A',status='PAUSED'); p=Prospect(first_name='T',email='t@example.com'); db.add_all([c,p]); await db.flush(); db.add(CampaignProspect(campaign_id=c.id,prospect_id=p.id)); await db.commit()
    result=await PolicyEngine().check(db,c,p.id,'email')
    assert not result.allowed and result.rule=='CAMPAIGN_STATE'
