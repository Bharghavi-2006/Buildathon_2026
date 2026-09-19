from datetime import datetime, timedelta
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.config import settings
from app.db.models import Campaign, CampaignAgent, CampaignProspect, SuppressionEntry, OutreachEvent, ChannelConfiguration
from app.schemas import PolicyResult

class PolicyEngine:
  async def check(self, db: AsyncSession, campaign: Campaign, prospect_id: str, channel: str) -> PolicyResult:
    if settings().global_kill_switch: return PolicyResult(allowed=False, reason='Global kill switch is active', rule='GLOBAL_KILL_SWITCH')
    if campaign.status != 'LIVE': return PolicyResult(allowed=False, reason='Campaign is not live', rule='CAMPAIGN_STATE')
    if channel not in campaign.active_channels: return PolicyResult(allowed=False, reason='Channel disabled for campaign', rule='CHANNEL_DISABLED')
    disabled = await db.scalar(select(ChannelConfiguration).where(ChannelConfiguration.channel==channel, ChannelConfiguration.enabled==False, (ChannelConfiguration.campaign_id==None) | (ChannelConfiguration.campaign_id==campaign.id)))
    if disabled: return PolicyResult(allowed=False, reason='Channel globally paused', rule='CHANNEL_PAUSED')
    agent = await db.scalar(select(CampaignAgent).where(CampaignAgent.campaign_id==campaign.id, CampaignAgent.agent_type=='outreach'))
    if agent and not agent.enabled: return PolicyResult(allowed=False, reason='Outreach agent paused', rule='AGENT_PAUSED')
    if await db.scalar(select(SuppressionEntry).where(SuppressionEntry.prospect_id==prospect_id, SuppressionEntry.active==True)): return PolicyResult(allowed=False, reason='Prospect is suppressed', rule='SUPPRESSION')
    recent = await db.scalar(select(OutreachEvent).where(OutreachEvent.prospect_id==prospect_id, OutreachEvent.status=='SENT', OutreachEvent.created_at > datetime.utcnow()-timedelta(hours=24)).order_by(OutreachEvent.created_at.desc()))
    if recent: return PolicyResult(allowed=False, reason='Contact frequency limit: contacted within 24 hours', rule='CONTACT_FREQUENCY')
    sent = await db.scalar(select(func.count()).select_from(OutreachEvent).where(OutreachEvent.campaign_id==campaign.id, OutreachEvent.status=='SENT', OutreachEvent.created_at > datetime.utcnow()-timedelta(days=1))) or 0
    if sent >= campaign.daily_outreach_limit: return PolicyResult(allowed=False, reason='Campaign daily outreach limit reached', rule='DAILY_LIMIT')
    overlap = await db.scalar(select(CampaignProspect).join(Campaign).where(CampaignProspect.prospect_id==prospect_id, CampaignProspect.campaign_id!=campaign.id, Campaign.status=='LIVE', CampaignProspect.last_contacted_at != None))
    if overlap: return PolicyResult(allowed=False, reason='Active outreach in another live campaign', rule='CROSS_CAMPAIGN_CONFLICT', metadata={'other_campaign_id':overlap.campaign_id})
    return PolicyResult(allowed=True, reason='All deterministic policy checks passed', rule='ALLOWED')
