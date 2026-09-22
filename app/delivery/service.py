"""Campaign-aware delivery resolution and audit persistence.

No route may redirect recipients itself: all approved delivery passes here.
"""
import asyncio
import smtplib
import ssl
from email.message import EmailMessage

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.models import Conversation, DeliveryRecord, Message


class DeliveryError(Exception):
    pass


# Which Prospect field is the recipient address for each channel, and how to name it in
# an error. 'message' is this platform's SMS channel value (see CampaignChannelSettings).
CHANNEL_RECIPIENT_FIELD = {'email': 'email', 'linkedin': 'linkedin_url', 'message': 'phone', 'sms': 'phone', 'voice': 'phone'}
CHANNEL_LABEL = {'email': 'email address', 'linkedin': 'LinkedIn profile', 'message': 'phone number', 'sms': 'phone number', 'voice': 'phone number'}


class EmailDeliveryService:
    @staticmethod
    def _send_via_smtp(*, recipient: str, subject: str, body: str) -> None:
        """Send only when an SMTP transport has explicitly been configured."""
        config = settings()
        if not config.smtp_host:
            return
        if not config.smtp_from_email:
            raise DeliveryError('SMTP_FROM_EMAIL is required when SMTP_HOST is configured.')

        message = EmailMessage()
        message['From'] = config.smtp_from_email
        message['To'] = recipient
        message['Subject'] = subject or 'Approved outreach message'
        message.set_content(body)

        try:
            with smtplib.SMTP(config.smtp_host, config.smtp_port, timeout=15) as client:
                if config.smtp_use_tls:
                    client.starttls(context=ssl.create_default_context())
                if config.smtp_username:
                    client.login(config.smtp_username, config.smtp_password)
                client.send_message(message)
        except (OSError, smtplib.SMTPException) as exc:
            raise DeliveryError(f'Unable to deliver approval email: {exc}') from exc

    async def deliver(self, db: AsyncSession, campaign, prospect, *, channel: str,
                      body: str, subject: str = '', approval_id: str | None = None,
                      policy_decision: dict | None = None, idempotency_key: str) -> DeliveryRecord:
        field = CHANNEL_RECIPIENT_FIELD.get(channel, 'email')
        intended_recipient = getattr(prospect, field, '') or ''
        if not intended_recipient:
            raise DeliveryError(f'Prospect has no {CHANNEL_LABEL.get(channel, channel)} on file.')
        if approval_id:
            # Approval actions are always copied to the designated demo inbox,
            # regardless of the outreach channel being approved.
            actual_recipient, delivery_mode = settings().approval_delivery_email, 'DEMO'
        elif channel == 'email' and campaign.demo_mode:
            # Only email has a configured demo-redirect target; other channels have no
            # equivalent, so their demo sends still resolve to the prospect's own contact
            # info below — no route in this codebase ever makes a real external call regardless.
            if not campaign.demo_recipient_email:
                raise DeliveryError('Demo mode is enabled but no demo recipient is configured.')
            actual_recipient, delivery_mode = campaign.demo_recipient_email, 'DEMO'
        else:
            actual_recipient, delivery_mode = intended_recipient, ('DEMO' if campaign.demo_mode else 'LIVE')
        existing = await db.scalar(select(DeliveryRecord).where(DeliveryRecord.idempotency_key == idempotency_key))
        if existing:
            return existing
        # SMTP is intentionally opt-in. Without SMTP_HOST, the application retains its
        # safe demo behavior and the DeliveryRecord remains the delivery audit trail.
        if approval_id and actual_recipient == settings().approval_delivery_email:
            await asyncio.to_thread(self._send_via_smtp, recipient=actual_recipient, subject=subject, body=body)
        conversation = await db.scalar(select(Conversation).where(
            Conversation.campaign_id == campaign.id, Conversation.prospect_id == prospect.id
        ))
        if not conversation:
            conversation = Conversation(campaign_id=campaign.id, prospect_id=prospect.id)
            db.add(conversation)
            await db.flush()
        record = DeliveryRecord(
            campaign_id=campaign.id, prospect_id=prospect.id, conversation_id=conversation.id, approval_id=approval_id,
            idempotency_key=idempotency_key, intended_recipient=intended_recipient,
            actual_recipient=actual_recipient, delivery_mode=delivery_mode, channel=channel,
            subject=subject, body=body, policy_decision=policy_decision or {},
        )
        db.add(record)
        # This is the outbound conversation audit. A production provider may be
        # attached behind this service, but no route writes an outbound message directly.
        db.add(Message(conversation_id=conversation.id, direction='OUTBOUND', channel=channel,
                       subject=subject, content=body))
        return record
