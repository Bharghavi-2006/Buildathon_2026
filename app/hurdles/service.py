"""Shared hurdle-materialization logic, used by both the rep-facing routes in
main.py and the manager-facing alerts endpoint in api/manager.py. Kept in its
own module (rather than main.py) so manager.py can call it without a circular
import (main.py imports manager.py's router)."""
from datetime import datetime, timedelta
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.config import settings
from app.db.models import Hurdle, OutreachEvent, AgentRun, ApprovalRequest, CampaignProspect, LeadAssignment

# Deterministic map of the PolicyEngine's fixed reason strings to a hurdle category/severity.
# The reason strings are the exhaustive, hardcoded set PolicyEngine.check() can ever return (app/policy/engine.py).
HURDLE_REASON_MAP={
    'Global kill switch is active':('POLICY_VIOLATION','WARNING'),
    'Campaign is currently paused by the manager.':('POLICY_VIOLATION','WARNING'),
    'Channel disabled for campaign':('CHANNEL_UNAVAILABLE','WARNING'),
    'Channel paused by manager':('CHANNEL_UNAVAILABLE','WARNING'),
    'Representative is inactive':('POLICY_VIOLATION','WARNING'),
    'Channel globally paused':('CHANNEL_UNAVAILABLE','WARNING'),
    'Outreach agent paused':('POLICY_VIOLATION','WARNING'),
    'Prospect is suppressed':('SUPPRESSION_DNC','ESCALATED'),
    'Contact frequency limit: contacted within 24 hours':('POLICY_VIOLATION','WARNING'),
    'Campaign daily outreach limit reached':('POLICY_VIOLATION','WARNING'),
    'Representative daily outreach limit reached':('POLICY_VIOLATION','WARNING'),
    'Outside configured working hours':('POLICY_VIOLATION','WARNING'),
    'Active outreach in another live campaign':('DUPLICATE_CONFLICT','ESCALATED'),
}
HURDLE_RECOMMENDED_ACTION={
    'SUPPRESSION_DNC':'Do not contact. This prospect is on the suppression/DNC list; confirm with your manager before any override.',
    'DUPLICATE_CONFLICT':'Coordinate with the owning campaign before continuing outreach; a blocking cross-campaign conflict was detected.',
    'CHANNEL_UNAVAILABLE':'This channel is currently disabled or unconfigured. Switch channel or ask your manager to re-enable it.',
    'POLICY_VIOLATION':'Review the policy reason. No outbound action is available on this prospect until it clears on its own or a manager intervenes.',
    'APPROVAL_BOTTLENECK':'This approval has aged past the SLA threshold. Review and act now, or escalate to your manager.',
    'MISSING_KNOWLEDGE':'The agent could not find enough verified information to proceed. Attach relevant knowledge to the campaign or escalate.',
}

async def _hurdle_representative(db,campaign_id,prospect_id):
    if not prospect_id: return None
    cp=await db.scalar(select(CampaignProspect).where(CampaignProspect.campaign_id==campaign_id,CampaignProspect.prospect_id==prospect_id))
    if not cp: return None
    assignment=await db.scalar(select(LeadAssignment).where(LeadAssignment.campaign_prospect_id==cp.id,LeadAssignment.status=='ASSIGNED'))
    return assignment.representative_id if assignment else None

async def ensure_hurdles(db:AsyncSession):
    """Idempotently materialize Hurdle rows from real, already-persisted signals. Never invents data."""
    existing=set((await db.execute(select(Hurdle.source_type,Hurdle.source_id))).all())
    created=False
    for event in (await db.scalars(select(OutreachEvent).where(OutreachEvent.status=='BLOCKED'))).all():
        if ('OUTREACH_EVENT',event.id) in existing: continue
        category,severity=HURDLE_REASON_MAP.get(event.blocked_reason,('POLICY_VIOLATION','WARNING'))
        rep_id=await _hurdle_representative(db,event.campaign_id,event.prospect_id)
        db.add(Hurdle(source_type='OUTREACH_EVENT',source_id=event.id,campaign_id=event.campaign_id,prospect_id=event.prospect_id,representative_id=rep_id,channel=event.channel,category=category,status=severity,agent_type='PERSONALIZATION',reason=event.blocked_reason,recommended_action=HURDLE_RECOMMENDED_ACTION[category],context={'outreach_event_id':event.id}))
        created=True
    for run in (await db.scalars(select(AgentRun).where(AgentRun.status=='FAILED',AgentRun.prospect_id.is_not(None)))).all():
        if ('AGENT_RUN',run.id) in existing: continue
        out=run.output_data or {}
        if out.get('error_code')=='AGENT_NOT_CONFIGURED': category,severity='CHANNEL_UNAVAILABLE','WARNING'
        else: category,severity='MISSING_KNOWLEDGE','ESCALATED'
        rep_id=await _hurdle_representative(db,run.campaign_id,run.prospect_id)
        db.add(Hurdle(source_type='AGENT_RUN',source_id=run.id,campaign_id=run.campaign_id,prospect_id=run.prospect_id,representative_id=rep_id,category=category,status=severity,agent_type=run.agent_type,agent_run_id=run.id,reason=out.get('error') or out.get('message') or f'{run.agent_type} run failed.',recommended_action=HURDLE_RECOMMENDED_ACTION[category],context={'agent_run_id':run.id,'output_data':out}))
        created=True
    threshold=datetime.utcnow()-timedelta(hours=settings().approval_aging_threshold_hours)
    for approval in (await db.scalars(select(ApprovalRequest).where(ApprovalRequest.status=='PENDING',ApprovalRequest.created_at<threshold))).all():
        if ('APPROVAL_REQUEST',approval.id) in existing: continue
        cp=await db.get(CampaignProspect,approval.campaign_prospect_id) if approval.campaign_prospect_id else None
        age_h=int((datetime.utcnow()-approval.created_at).total_seconds()/3600)
        db.add(Hurdle(source_type='APPROVAL_REQUEST',source_id=approval.id,campaign_id=approval.campaign_id,prospect_id=cp.prospect_id if cp else None,representative_id=approval.representative_id,channel=(approval.payload or {}).get('channel','email'),category='APPROVAL_BOTTLENECK',status='ESCALATED',agent_type=(approval.payload or {}).get('agent','PERSONALIZATION'),reason=f'Approval has been pending for {age_h}h, past the {settings().approval_aging_threshold_hours}h SLA threshold.',recommended_action=HURDLE_RECOMMENDED_ACTION['APPROVAL_BOTTLENECK'],context={'approval_id':approval.id,'age_hours':age_h}))
        created=True
    if created: await db.commit()
