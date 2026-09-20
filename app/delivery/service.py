"""Campaign-aware delivery resolution and audit persistence.

No route may redirect recipients itself: all approved delivery passes here.
"""
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Conversation, DeliveryRecord, Message


class DeliveryError(Exception):
    pass


class EmailDeliveryService:
    async def deliver(self, db: AsyncSession, campaign, prospect, *, channel: str,
                      body: str, subject: str = '', approval_id: str | None = None,
                      policy_decision: dict | None = None, idempotency_key: str) -> DeliveryRecord:
        if not prospect.email:
            raise DeliveryError('Prospect has no email recipient.')
        if campaign.demo_mode:
            if not campaign.demo_recipient_email:
                raise DeliveryError('Demo mode is enabled but no demo recipient is configured.')
            actual_recipient, delivery_mode = campaign.demo_recipient_email, 'DEMO'
        else:
            actual_recipient, delivery_mode = prospect.email, 'LIVE'
        existing = await db.scalar(select(DeliveryRecord).where(DeliveryRecord.idempotency_key == idempotency_key))
        if existing:
            return existing
        conversation = await db.scalar(select(Conversation).where(
            Conversation.campaign_id == campaign.id, Conversation.prospect_id == prospect.id
        ))
        if not conversation:
            conversation = Conversation(campaign_id=campaign.id, prospect_id=prospect.id)
            db.add(conversation)
            await db.flush()
        record = DeliveryRecord(
            campaign_id=campaign.id, prospect_id=prospect.id, conversation_id=conversation.id, approval_id=approval_id,
            idempotency_key=idempotency_key, intended_recipient=prospect.email,
            actual_recipient=actual_recipient, delivery_mode=delivery_mode, channel=channel,
            subject=subject, body=body, policy_decision=policy_decision or {},
        )
        db.add(record)
        # This is the outbound conversation audit. A production provider may be
        # attached behind this service, but no route writes an outbound message directly.
        db.add(Message(conversation_id=conversation.id, direction='OUTBOUND', channel=channel,
                       subject=subject, content=body))
        return record
