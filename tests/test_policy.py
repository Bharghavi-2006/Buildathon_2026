import pytest
from app.db.models import Campaign, Prospect, CampaignProspect, CampaignAgent, CampaignChannelSettings, SuppressionEntry
from app.policy.engine import PolicyEngine
@pytest.mark.asyncio
async def test_paused_campaign_is_blocked(db):
    c=Campaign(name='A',status='PAUSED'); p=Prospect(first_name='T',email='t@example.com'); db.add_all([c,p]); await db.flush(); db.add(CampaignProspect(campaign_id=c.id,prospect_id=p.id)); await db.commit()
    result=await PolicyEngine().check(db,c,p.id,'email')
    assert not result.allowed and result.rule=='CAMPAIGN_PAUSED'

@pytest.mark.asyncio
async def test_paused_channel_and_agent_are_blocked(db):
    c=Campaign(name='A',status='LIVE',active_channels=['email']); p=Prospect(first_name='T',email='channel@example.com')
    db.add_all([c,p]); await db.flush(); db.add_all([CampaignProspect(campaign_id=c.id,prospect_id=p.id),CampaignChannelSettings(campaign_id=c.id,channel='email',enabled=False)]); await db.commit()
    result=await PolicyEngine().check(db,c,p.id,'email')
    assert not result.allowed and result.rule=='CHANNEL_PAUSED'
    (await db.scalars(__import__('sqlalchemy').select(CampaignChannelSettings))).one().enabled=True
    db.add(CampaignAgent(campaign_id=c.id,agent_type='PERSONALIZATION',enabled=False)); await db.commit()
    result=await PolicyEngine().check(db,c,p.id,'email',agent_type='PERSONALIZATION')
    assert not result.allowed and result.rule=='AGENT_PAUSED'

@pytest.mark.asyncio
async def test_suppression_is_final_outbound_block(db):
    c=Campaign(name='A',status='LIVE',active_channels=['email']); p=Prospect(first_name='T',email='suppressed@example.com')
    db.add_all([c,p]); await db.flush(); db.add_all([CampaignProspect(campaign_id=c.id,prospect_id=p.id),SuppressionEntry(prospect_id=p.id,reason='DNC')]); await db.commit()
    result=await PolicyEngine().check(db,c,p.id,'email')
    assert not result.allowed and result.rule=='SUPPRESSION'
