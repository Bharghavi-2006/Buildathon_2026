from datetime import datetime
from pydantic import BaseModel, Field
class CampaignIn(BaseModel):
    name: str; description: str=''; icp_config: dict=Field(default_factory=dict); target_geography: str=''; target_industries: list[str]=Field(default_factory=list); target_roles: list[str]=Field(default_factory=list); company_size: dict=Field(default_factory=dict); instructions: str=''; active_channels: list[str]=Field(default_factory=lambda:['email']); daily_outreach_limit: int=25; approval_required: bool=False
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
class CampaignAssignmentIn(BaseModel): representative_id: str
class LeadAssignmentIn(BaseModel): representative_id: str
class ApprovalDecisionIn(BaseModel): approved: bool; note: str=''
class BatchApprovalDecisionIn(ApprovalDecisionIn): approval_ids: list[str]
class RepresentativeProfileIn(BaseModel): name: str; email: str; max_active_leads: int=20; specialties: list[str]=Field(default_factory=list); regions: list[str]=Field(default_factory=list)
