from datetime import datetime
from typing import Literal
from pydantic import BaseModel, Field
class CampaignIn(BaseModel):
    name: str; description: str=''; icp_config: dict=Field(default_factory=dict); target_geography: str=''; target_industries: list[str]=Field(default_factory=list); target_roles: list[str]=Field(default_factory=list); company_size: dict=Field(default_factory=dict); instructions: str=''; active_channels: list[str]=Field(default_factory=lambda:['email']); daily_outreach_limit: int=25; approval_required: bool=True; demo_mode: bool=True; demo_recipient_email: str|None=None
class ProspectIn(BaseModel):
    first_name: str; last_name: str=''; email: str; title: str=''; location: str=''; industry: str=''; employee_count: int=0; website: str=''; phone: str=''; linkedin_url: str=''
class InboundMessage(BaseModel):
    prospect_id: str; campaign_id: str|None=None; channel: str='email'; content: str
class KnowledgeIn(BaseModel): title: str; content: str; category: str='general'
class ControlIn(BaseModel): enabled: bool=True
class QualificationResult(BaseModel): qualified: bool; score: float; reasons: list[str]; evidence: list[str]; missing_information: list[str]=[]
class OutreachDecision(BaseModel): should_contact: bool; channel: str; objective: str; message_angle: str; reasoning: str
class PersonalizedOutreach(BaseModel): channel: str; subject: str; body: str; personalization_facts: list[str]; cta: str; reasoning: str
class PolicyResult(BaseModel): allowed: bool; reason: str; rule: str; metadata: dict=Field(default_factory=dict)
class CampaignAssignmentIn(BaseModel):
    representative_id: str
    daily_send_limit: int|None=None
    assigned_lead_limit: int|None=None
    working_hours: dict=Field(default_factory=dict)
    routing_rule: dict=Field(default_factory=dict)
class LeadAssignmentIn(BaseModel): representative_id: str
class ApprovalDecisionIn(BaseModel): approved: bool; note: str=''
class BatchApprovalDecisionIn(ApprovalDecisionIn): approval_ids: list[str]
class RepresentativeProfileIn(BaseModel):
    name: str; email: str; max_active_leads: int=20; specialties: list[str]=Field(default_factory=list); regions: list[str]=Field(default_factory=list)
    supported_channels: list[str]=Field(default_factory=list); timezone: str=''; working_hours: dict=Field(default_factory=dict)
class ManagerCampaignCreate(BaseModel): name: str; description: str=''
class IdentityIn(BaseModel): name: str; description: str=''; owner_id: str
class IcpIn(BaseModel): geography: str=''; target_roles: list[str]=Field(default_factory=list); industries: list[str]=Field(default_factory=list); company_size: dict=Field(default_factory=dict); revenue_range: dict=Field(default_factory=dict); funding_stage: list[str]=Field(default_factory=list); technologies: list[str]=Field(default_factory=list); exclusion_criteria: list[str]=Field(default_factory=list); reference_profiles: list[dict]=Field(default_factory=list); custom_criteria: dict=Field(default_factory=dict)
class AgentConfigIn(BaseModel): enabled: bool; responsibilities: list[str]=Field(default_factory=list); decision_thresholds: dict=Field(default_factory=dict); escalation_rules: dict=Field(default_factory=dict); prompt_version_id: str|None=None
class ProspectImportIn(BaseModel): prospects: list[ProspectIn]
class ProspectSelectIn(BaseModel): prospect_ids: list[str]; min_fit_score: float=Field(default=60,ge=0,le=100)
class ChannelSettingsIn(BaseModel): channels: list[dict]
class PromptIn(BaseModel): agent_type: str; prompt_text: str; configuration: dict=Field(default_factory=dict)
class ApprovalEditIn(BaseModel): content: str
class ApprovalRejectIn(BaseModel): reason: str
class BatchApprovalIn(BaseModel): approval_ids: list[str]
class DiscoveryRequestIn(BaseModel): requested_count: int=Field(default=25,ge=1,le=100)
class DiscoveryCandidate(BaseModel):
    source: Literal['APOLLO','WEB_SCRAPER']; source_id: str; person_name: str|None=None; first_name: str|None=None; last_name: str|None=None; title: str|None=None; email: str|None=None; linkedin_url: str|None=None; company_name: str|None=None; company_domain: str|None=None; company_size: int|None=None; industry: str|None=None
    fit_score: float=Field(ge=0,le=100); fit_reasons: list[str]=Field(default_factory=list); matched_criteria: list[str]=Field(default_factory=list); unmatched_criteria: list[str]=Field(default_factory=list); confidence: Literal['HIGH','MEDIUM','LOW']
class DiscoveryResult(BaseModel):
    campaign_id: str; candidates: list[DiscoveryCandidate]=Field(default_factory=list); total_found: int=Field(ge=0); search_summary: str=''; execution_id: str|None=None
class ResearchRequestIn(BaseModel): force_refresh: bool=False
class IcpEvidence(BaseModel): criterion: str; status: Literal['MATCHED','UNMATCHED','UNVERIFIED']; evidence: str; source: str=''
class ResearchResult(BaseModel):
    campaign_id: str; candidate_status: Literal['verified','partially_verified','unverified']; research_summary: str; person_research: dict=Field(default_factory=dict); company_research: dict=Field(default_factory=dict); icp_evidence: list[IcpEvidence]=Field(default_factory=list); business_context: list[str]=Field(default_factory=list); personalization_signals: list[str]=Field(default_factory=list); sources: list[str]=Field(default_factory=list); uncertainties: list[str]=Field(default_factory=list); execution_id: str|None=None
class FitmentRequestIn(BaseModel): force_refresh: bool=False
class DemoModeIn(BaseModel):
    demo_mode: bool=True
    demo_recipient_email: str|None=None
class DemoReplyIn(BaseModel): message: str
class HurdleResolveIn(BaseModel): note: str=''
class HurdleKnowledgeIn(BaseModel): title: str; content: str
class SuppressionIn(BaseModel): prospect_email: str; reason: str='Manual DNC entry'
class NotificationThresholdsIn(BaseModel): approval_aging_threshold_hours: int=Field(ge=1,le=168); capacity_alert_threshold_pct: int=Field(ge=1,le=100)
class ManagerCreateIn(BaseModel): name: str; email: str
