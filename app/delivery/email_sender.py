"""Real SMTP notification email, separate from the simulated DeliveryRecord/Message
audit trail in service.py. Fires once an approval actually clears policy and is marked
SENT, so a human inbox gets a real copy of what the platform just approved.

Silently no-ops (logs a warning) when SMTP isn't configured, so a missing/blank
.env never breaks the approval flow -- this is best-effort notification, not the
system of record for delivery.
"""
import logging
import os
import smtplib
from email.mime.text import MIMEText

logger = logging.getLogger('app.delivery.email_sender')

APPROVAL_NOTIFICATION_RECIPIENT = 'ch24b007@smail.iitm.ac.in'


def _smtp_config() -> dict | None:
    host = os.getenv('SMTP_HOST')
    username = os.getenv('SMTP_USERNAME')
    password = os.getenv('SMTP_PASSWORD')
    if not (host and username and password):
        return None
    return {
        'host': host,
        'port': int(os.getenv('SMTP_PORT', '587')),
        'username': username,
        'password': password,
        'from_email': os.getenv('SMTP_FROM_EMAIL', username),
        'use_tls': os.getenv('SMTP_USE_TLS', 'true').lower() != 'false',
    }


def send_approval_notification(*, prospect_name: str, campaign_name: str, channel: str,
                                message: str, approved_by: str, to_email: str = APPROVAL_NOTIFICATION_RECIPIENT) -> bool:
    """Sends a real email summarizing an approved outreach. Returns True on send,
    False if SMTP isn't configured or the send failed -- never raises."""
    config = _smtp_config()
    if not config:
        logger.warning(
            'SMTP not configured (SMTP_HOST/SMTP_USERNAME/SMTP_PASSWORD) -- '
            'skipping approval notification email to %s', to_email,
        )
        return False

    subject = f'Outreach approved: {prospect_name} · {campaign_name}'
    body = (
        f'An outreach draft was just approved on the Autonomous SDR Platform.\n\n'
        f'Prospect: {prospect_name}\n'
        f'Campaign: {campaign_name}\n'
        f'Channel: {channel}\n'
        f'Approved by: {approved_by}\n\n'
        f'Message:\n{message}\n'
    )
    mime = MIMEText(body)
    mime['Subject'] = subject
    mime['From'] = config['from_email']
    mime['To'] = to_email

    try:
        with smtplib.SMTP(config['host'], config['port'], timeout=10) as server:
            if config['use_tls']:
                server.starttls()
            server.login(config['username'], config['password'])
            server.sendmail(config['from_email'], [to_email], mime.as_string())
        return True
    except Exception:
        logger.exception('Failed to send approval notification email to %s', to_email)
        return False
