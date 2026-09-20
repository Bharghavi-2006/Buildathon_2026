from datetime import datetime, timedelta
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.config import settings
from app.db.models import Campaign, CampaignAgent, CampaignProspect, SuppressionEntry, OutreachEvent, ChannelConfiguration, CampaignChannelSettings, AccessProfile, ApprovalRequest
from app.schemas import PolicyResult

class PolicyEngine:
  async def check_continuation(self, db: AsyncSession, prospect_id: str, channel: str) -> PolicyResult:
    """A reply on an already-open conversation is not new outreach: campaign-paused,
    daily limits, working hours, and cross-campaign conflict all govern whether a NEW
    prospect enters a funnel, not whether a human can finish a thread already underway.
    Only the two safety-critical, never-bypassable checks apply here."""
    if settings().global_kill_switch: return PolicyResult(allowed=False, reason='Global kill switch is active', rule='GLOBAL_KILL_SWITCH')
    if await db.scalar(select(SuppressionEntry).where(SuppressionEntry.prospect_id==prospect_id, SuppressionEntry.active==True)): return PolicyResult(allowed=False, reason='Prospect is suppressed', rule='SUPPRESSION')
    return PolicyResult(allowed=True, reason='Continuing an already-open conversation', rule='ALLOWED')
  async def check_agent_execution(self, db: AsyncSession, campaign: Campaign, agent_type: str) -> PolicyResult:
    if settings().global_kill_switch: return PolicyResult(allowed=False,reason='Global kill switch is active',rule='GLOBAL_KILL_SWITCH')
    if campaign.status=='PAUSED': return PolicyResult(allowed=False,reason='Campaign is currently paused by the manager.',rule='CAMPAIGN_PAUSED')
    agent=await db.scalar(select(CampaignAgent).where(CampaignAgent.campaign_id==campaign.id,CampaignAgent.agent_type.in_([agent_type,agent_type.lower()])))
    if agent and not agent.enabled: return PolicyResult(allowed=False,reason=f'{agent_type} agent is paused by the manager.',rule='AGENT_PAUSED')
    return PolicyResult(allowed=True,reason='Agent execution allowed',rule='ALLOWED')
  async def check(self, db: AsyncSession, campaign: Campaign, prospect_id: str, channel: str, representative_id: str|None=None, agent_type: str|None=None) -> PolicyResult:
    if settings().global_kill_switch: return PolicyResult(allowed=False, reason='Global kill switch is active', rule='GLOBAL_KILL_SWITCH')
    if campaign.status != 'LIVE': return PolicyResult(allowed=False, reason='Campaign is currently paused by the manager.', rule='CAMPAIGN_PAUSED')
    if channel not in campaign.active_channels: return PolicyResult(allowed=False, reason='Channel disabled for campaign', rule='CHANNEL_DISABLED')
    campaign_channel=await db.scalar(select(CampaignChannelSettings).where(CampaignChannelSettings.campaign_id==campaign.id,CampaignChannelSettings.channel==channel))
    if campaign_channel and not campaign_channel.enabled: return PolicyResult(allowed=False, reason='Channel paused by manager', rule='CHANNEL_PAUSED')
    if representative_id:
      profile=await db.scalar(select(AccessProfile).where(AccessProfile.user_id==representative_id))
      if not profile or not profile.active: return PolicyResult(allowed=False, reason='Representative is inactive', rule='REPRESENTATIVE_INACTIVE')
    disabled = await db.scalar(select(ChannelConfiguration).where(ChannelConfiguration.channel==channel, ChannelConfiguration.enabled==False, (ChannelConfiguration.campaign_id==None) | (ChannelConfiguration.campaign_id==campaign.id)))
    if disabled: return PolicyResult(allowed=False, reason='Channel globally paused', rule='CHANNEL_PAUSED')
    agent_types=[agent_type,agent_type.upper(),agent_type.lower()] if agent_type else ['outreach','OUTREACH','PERSONALIZATION']
    agent = await db.scalar(select(CampaignAgent).where(CampaignAgent.campaign_id==campaign.id, CampaignAgent.agent_type.in_([x for x in agent_types if x])))
    if agent and not agent.enabled: return PolicyResult(allowed=False, reason='Outreach agent paused', rule='AGENT_PAUSED')
    if await db.scalar(select(SuppressionEntry).where(SuppressionEntry.prospect_id==prospect_id, SuppressionEntry.active==True)): return PolicyResult(allowed=False, reason='Prospect is suppressed', rule='SUPPRESSION')
    recent = await db.scalar(select(OutreachEvent).where(OutreachEvent.prospect_id==prospect_id, OutreachEvent.status=='SENT', OutreachEvent.created_at > datetime.utcnow()-timedelta(hours=24)).order_by(OutreachEvent.created_at.desc()))
    if recent: return PolicyResult(allowed=False, reason='Contact frequency limit: contacted within 24 hours', rule='CONTACT_FREQUENCY')
    sent = await db.scalar(select(func.count()).select_from(OutreachEvent).where(OutreachEvent.campaign_id==campaign.id, OutreachEvent.status=='SENT', OutreachEvent.created_at > datetime.utcnow()-timedelta(days=1))) or 0
    if sent >= campaign.daily_outreach_limit: return PolicyResult(allowed=False, reason='Campaign daily outreach limit reached', rule='CAMPAIGN_DAILY_LIMIT')
    if representative_id:
      rep_sent=await db.scalar(select(func.count()).select_from(ApprovalRequest).where(ApprovalRequest.representative_id==representative_id, ApprovalRequest.status.in_(['SENT','SCHEDULED']), ApprovalRequest.updated_at > datetime.utcnow()-timedelta(days=1))) or 0
      if rep_sent >= 25: return PolicyResult(allowed=False, reason='Representative daily outreach limit reached', rule='REPRESENTATIVE_DAILY_LIMIT')
    if campaign_channel and campaign_channel.working_hours:
      hours=campaign_channel.working_hours; start=hours.get('start'); end=hours.get('end')
      if start is not None and end is not None and not (int(start) <= datetime.utcnow().hour < int(end)):
        return PolicyResult(allowed=False, reason='Outside configured working hours', rule='OUTSIDE_WORKING_HOURS', metadata={'schedule': True})
    overlap = await db.scalar(select(CampaignProspect).join(Campaign).where(CampaignProspect.prospect_id==prospect_id, CampaignProspect.campaign_id!=campaign.id, Campaign.status=='LIVE', CampaignProspect.last_contacted_at != None))
    if overlap: return PolicyResult(allowed=False, reason='Active outreach in another live campaign', rule='CROSS_CAMPAIGN_CONFLICT', metadata={'other_campaign_id':overlap.campaign_id})
    return PolicyResult(allowed=True, reason='All deterministic policy checks passed', rule='ALLOWED')
