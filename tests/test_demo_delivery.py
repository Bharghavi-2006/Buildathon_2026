import pytest
from sqlalchemy import select

from app.delivery.service import DeliveryError, EmailDeliveryService
from app.db.models import Campaign, CampaignProspect, Conversation, DeliveryRecord, Prospect, User, AccessProfile
from app.main import inject_demo_reply
from app.schemas import DemoReplyIn


@pytest.mark.asyncio
async def test_delivery_uses_intended_recipient_when_demo_is_off(db):
    campaign = Campaign(name='Live', status='LIVE', demo_mode=False)
    prospect = Prospect(first_name='Ada', email='ada@example.test')
    db.add_all([campaign, prospect]); await db.flush()
    record = await EmailDeliveryService().deliver(db, campaign, prospect, channel='email', body='Hello', idempotency_key='live-1')
    await db.commit()
    assert record.delivery_mode == 'LIVE'
    assert record.intended_recipient == record.actual_recipient == 'ada@example.test'


@pytest.mark.asyncio
async def test_demo_delivery_redirects_and_is_idempotent(db):
    campaign = Campaign(name='Demo', status='LIVE', demo_mode=True, demo_recipient_email='manager@example.test')
    prospect = Prospect(first_name='Ada', email='ada@example.test')
    db.add_all([campaign, prospect]); await db.flush()
    first = await EmailDeliveryService().deliver(db, campaign, prospect, channel='email', body='Hi Ada', idempotency_key='demo-1')
    await db.commit()
    second = await EmailDeliveryService().deliver(db, campaign, prospect, channel='email', body='Hi Ada', idempotency_key='demo-1')
    assert first.id == second.id
    assert first.delivery_mode == 'DEMO'
    assert first.intended_recipient == 'ada@example.test'
    assert first.actual_recipient == 'manager@example.test'
    assert len((await db.scalars(select(DeliveryRecord))).all()) == 1


@pytest.mark.asyncio
async def test_demo_delivery_fails_closed_without_recipient(db):
    campaign = Campaign(name='Unsafe demo', status='LIVE', demo_mode=True)
    prospect = Prospect(first_name='Ada', email='ada@example.test')
    db.add_all([campaign, prospect]); await db.flush()
    with pytest.raises(DeliveryError, match='no demo recipient'):
        await EmailDeliveryService().deliver(db, campaign, prospect, channel='email', body='No send', idempotency_key='blocked')


@pytest.mark.asyncio
async def test_demo_reply_keeps_original_prospect_association(db):
    manager = User(name='Manager', email='manager@example.test')
    prospect = Prospect(first_name='Ada', email='ada@example.test')
    campaign = Campaign(name='Demo', status='LIVE', demo_mode=True, demo_recipient_email='manager@example.test')
    db.add_all([manager, prospect, campaign]); await db.flush()
    profile = AccessProfile(user_id=manager.id, role='MANAGER')
    db.add_all([profile, CampaignProspect(campaign_id=campaign.id, prospect_id=prospect.id), Conversation(campaign_id=campaign.id, prospect_id=prospect.id)])
    await db.commit()
    conversation = (await db.scalars(select(Conversation))).one()
    result = await inject_demo_reply(conversation.id, DemoReplyIn(message='Interested'), db, (manager, profile))
    assert result['prospect_id'] == prospect.id
    assert result['delivery_mode'] == 'DEMO'
