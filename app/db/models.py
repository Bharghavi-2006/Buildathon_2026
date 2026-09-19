from datetime import datetime
from uuid import uuid4
from sqlalchemy import String, DateTime, Boolean, Float, ForeignKey, Text, JSON, Integer
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

def uid(): return str(uuid4())
def now(): return datetime.utcnow()
class Base(DeclarativeBase): pass
class Timestamped:
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now, onupdate=now)

class User(Base, Timestamped):
    __tablename__='users'; id: Mapped[str]=mapped_column(String,primary_key=True,default=uid); email: Mapped[str]=mapped_column(String,unique=True); name: Mapped[str]=mapped_column(String)
class AccessProfile(Base, Timestamped):
    """Role and capacity live separately so the original User table stays stable."""
    __tablename__='access_profiles'; id: Mapped[str]=mapped_column(String,primary_key=True,default=uid); user_id: Mapped[str]=mapped_column(ForeignKey('users.id'),unique=True); role: Mapped[str]=mapped_column(String); max_active_leads: Mapped[int]=mapped_column(Integer,default=20); specialties: Mapped[list]=mapped_column(JSON,default=list); regions: Mapped[list]=mapped_column(JSON,default=list); active: Mapped[bool]=mapped_column(Boolean,default=True)
class CampaignAssignment(Base, Timestamped):
    __tablename__='campaign_assignments'; id: Mapped[str]=mapped_column(String,primary_key=True,default=uid); campaign_id: Mapped[str]=mapped_column(ForeignKey('campaigns.id')); representative_id: Mapped[str]=mapped_column(ForeignKey('users.id')); assigned_by_id: Mapped[str]=mapped_column(ForeignKey('users.id')); active: Mapped[bool]=mapped_column(Boolean,default=True)
class LeadAssignment(Base, Timestamped):
    __tablename__='lead_assignments'; id: Mapped[str]=mapped_column(String,primary_key=True,default=uid); campaign_prospect_id: Mapped[str]=mapped_column(ForeignKey('campaign_prospects.id'),unique=True); representative_id: Mapped[str]=mapped_column(ForeignKey('users.id')); assigned_by_id: Mapped[str]=mapped_column(ForeignKey('users.id')); status: Mapped[str]=mapped_column(String,default='ASSIGNED')
class ApprovalRequest(Base, Timestamped):
    __tablename__='approval_requests'; id: Mapped[str]=mapped_column(String,primary_key=True,default=uid); campaign_id: Mapped[str]=mapped_column(ForeignKey('campaigns.id')); campaign_prospect_id: Mapped[str|None]=mapped_column(ForeignKey('campaign_prospects.id'),nullable=True); representative_id: Mapped[str|None]=mapped_column(ForeignKey('users.id'),nullable=True); request_type: Mapped[str]=mapped_column(String); payload: Mapped[dict]=mapped_column(JSON,default=dict); status: Mapped[str]=mapped_column(String,default='PENDING'); decided_by_id: Mapped[str|None]=mapped_column(ForeignKey('users.id'),nullable=True); decision_note: Mapped[str]=mapped_column(Text,default='')
class Campaign(Base, Timestamped):
    __tablename__='campaigns'; id: Mapped[str]=mapped_column(String,primary_key=True,default=uid); name: Mapped[str]=mapped_column(String); description: Mapped[str]=mapped_column(Text,default=''); status: Mapped[str]=mapped_column(String,default='DRAFT'); icp_config: Mapped[dict]=mapped_column(JSON,default=dict); target_geography: Mapped[str]=mapped_column(String,default=''); target_industries: Mapped[list]=mapped_column(JSON,default=list); target_roles: Mapped[list]=mapped_column(JSON,default=list); company_size: Mapped[dict]=mapped_column(JSON,default=dict); instructions: Mapped[str]=mapped_column(Text,default=''); active_channels: Mapped[list]=mapped_column(JSON,default=lambda:['email']); daily_outreach_limit: Mapped[int]=mapped_column(Integer,default=25); approval_required: Mapped[bool]=mapped_column(Boolean,default=False)
class CampaignAgent(Base, Timestamped):
    __tablename__='campaign_agents'; id: Mapped[str]=mapped_column(String,primary_key=True,default=uid); campaign_id: Mapped[str]=mapped_column(ForeignKey('campaigns.id')); agent_type: Mapped[str]=mapped_column(String); enabled: Mapped[bool]=mapped_column(Boolean,default=True)
class Company(Base, Timestamped):
    __tablename__='companies'; id: Mapped[str]=mapped_column(String,primary_key=True,default=uid); name: Mapped[str]=mapped_column(String); website: Mapped[str]=mapped_column(String,default=''); industry: Mapped[str]=mapped_column(String,default=''); employee_count: Mapped[int]=mapped_column(Integer,default=0)
class Prospect(Base, Timestamped):
    __tablename__='prospects'; id: Mapped[str]=mapped_column(String,primary_key=True,default=uid); first_name: Mapped[str]=mapped_column(String); last_name: Mapped[str]=mapped_column(String,default=''); email: Mapped[str]=mapped_column(String,unique=True); phone: Mapped[str]=mapped_column(String,default=''); linkedin_url: Mapped[str]=mapped_column(String,default=''); title: Mapped[str]=mapped_column(String,default=''); company_id: Mapped[str|None]=mapped_column(ForeignKey('companies.id'),nullable=True); location: Mapped[str]=mapped_column(String,default=''); industry: Mapped[str]=mapped_column(String,default=''); employee_count: Mapped[int]=mapped_column(Integer,default=0); website: Mapped[str]=mapped_column(String,default=''); metadata_: Mapped[dict]=mapped_column('metadata',JSON,default=dict); lifecycle_status: Mapped[str]=mapped_column(String,default='DISCOVERED')
class CampaignProspect(Base, Timestamped):
    __tablename__='campaign_prospects'; id: Mapped[str]=mapped_column(String,primary_key=True,default=uid); campaign_id: Mapped[str]=mapped_column(ForeignKey('campaigns.id')); prospect_id: Mapped[str]=mapped_column(ForeignKey('prospects.id')); qualification_status: Mapped[str]=mapped_column(String,default='PENDING'); qualification_score: Mapped[float]=mapped_column(Float,default=0); qualification_reason: Mapped[str]=mapped_column(Text,default=''); current_stage: Mapped[str]=mapped_column(String,default='DISCOVERED'); last_contacted_at: Mapped[datetime|None]=mapped_column(DateTime,nullable=True); next_followup_at: Mapped[datetime|None]=mapped_column(DateTime,nullable=True); campaign_specific_context: Mapped[dict]=mapped_column(JSON,default=dict)
class Conversation(Base, Timestamped):
    __tablename__='conversations'; id: Mapped[str]=mapped_column(String,primary_key=True,default=uid); prospect_id: Mapped[str]=mapped_column(ForeignKey('prospects.id')); campaign_id: Mapped[str|None]=mapped_column(ForeignKey('campaigns.id'),nullable=True); status: Mapped[str]=mapped_column(String,default='OPEN')
class Message(Base, Timestamped):
    __tablename__='messages'; id: Mapped[str]=mapped_column(String,primary_key=True,default=uid); conversation_id: Mapped[str]=mapped_column(ForeignKey('conversations.id')); direction: Mapped[str]=mapped_column(String); channel: Mapped[str]=mapped_column(String); content: Mapped[str]=mapped_column(Text); subject: Mapped[str]=mapped_column(String,default='')
class AgentRun(Base, Timestamped):
    __tablename__='agent_runs'; id: Mapped[str]=mapped_column(String,primary_key=True,default=uid); campaign_id: Mapped[str]=mapped_column(ForeignKey('campaigns.id')); prospect_id: Mapped[str|None]=mapped_column(ForeignKey('prospects.id'),nullable=True); agent_type: Mapped[str]=mapped_column(String); status: Mapped[str]=mapped_column(String,default='COMPLETED'); input_data: Mapped[dict]=mapped_column(JSON,default=dict); output_data: Mapped[dict]=mapped_column(JSON,default=dict); prompt_version_id: Mapped[str|None]=mapped_column(ForeignKey('prompt_versions.id'),nullable=True)
class AgentDecision(Base, Timestamped):
    __tablename__='agent_decisions'; id: Mapped[str]=mapped_column(String,primary_key=True,default=uid); agent_run_id: Mapped[str]=mapped_column(ForeignKey('agent_runs.id')); decision_type: Mapped[str]=mapped_column(String); payload: Mapped[dict]=mapped_column(JSON,default=dict)
class PromptVersion(Base, Timestamped):
    __tablename__='prompt_versions'; id: Mapped[str]=mapped_column(String,primary_key=True,default=uid); agent_type: Mapped[str]=mapped_column(String); version: Mapped[str]=mapped_column(String); prompt_text: Mapped[str]=mapped_column(Text); configuration: Mapped[dict]=mapped_column(JSON,default=dict); active: Mapped[bool]=mapped_column(Boolean,default=True)
class OutreachEvent(Base, Timestamped):
    __tablename__='outreach_events'; id: Mapped[str]=mapped_column(String,primary_key=True,default=uid); campaign_id: Mapped[str]=mapped_column(ForeignKey('campaigns.id')); prospect_id: Mapped[str]=mapped_column(ForeignKey('prospects.id')); channel: Mapped[str]=mapped_column(String); status: Mapped[str]=mapped_column(String); content: Mapped[str]=mapped_column(Text); blocked_reason: Mapped[str]=mapped_column(String,default='')
class ScheduledAction(Base, Timestamped):
    __tablename__='scheduled_actions'; id: Mapped[str]=mapped_column(String,primary_key=True,default=uid); action_type: Mapped[str]=mapped_column(String); campaign_id: Mapped[str]=mapped_column(ForeignKey('campaigns.id')); prospect_id: Mapped[str]=mapped_column(ForeignKey('prospects.id')); channel: Mapped[str]=mapped_column(String); scheduled_at: Mapped[datetime]=mapped_column(DateTime); status: Mapped[str]=mapped_column(String,default='PENDING'); metadata_: Mapped[dict]=mapped_column('metadata',JSON,default=dict)
class KnowledgeDocument(Base, Timestamped):
    __tablename__='knowledge_documents'; id: Mapped[str]=mapped_column(String,primary_key=True,default=uid); title: Mapped[str]=mapped_column(String); content: Mapped[str]=mapped_column(Text); category: Mapped[str]=mapped_column(String,default='general')
class KnowledgeChunk(Base, Timestamped):
    __tablename__='knowledge_chunks'; id: Mapped[str]=mapped_column(String,primary_key=True,default=uid); document_id: Mapped[str]=mapped_column(ForeignKey('knowledge_documents.id')); content: Mapped[str]=mapped_column(Text); metadata_: Mapped[dict]=mapped_column('metadata',JSON,default=dict)
class ResearchFact(Base, Timestamped):
    __tablename__='research_facts'; id: Mapped[str]=mapped_column(String,primary_key=True,default=uid); prospect_id: Mapped[str]=mapped_column(ForeignKey('prospects.id')); fact: Mapped[str]=mapped_column(Text); source_id: Mapped[str|None]=mapped_column(ForeignKey('sources.id'),nullable=True); source_url: Mapped[str]=mapped_column(String,default=''); confidence: Mapped[float]=mapped_column(Float,default=.8)
class Source(Base, Timestamped):
    __tablename__='sources'; id: Mapped[str]=mapped_column(String,primary_key=True,default=uid); name: Mapped[str]=mapped_column(String); url: Mapped[str]=mapped_column(String,default='')
class SuppressionEntry(Base, Timestamped):
    __tablename__='suppression_entries'; id: Mapped[str]=mapped_column(String,primary_key=True,default=uid); prospect_id: Mapped[str]=mapped_column(ForeignKey('prospects.id')); reason: Mapped[str]=mapped_column(String); active: Mapped[bool]=mapped_column(Boolean,default=True)
class ChannelConfiguration(Base, Timestamped):
    __tablename__='channel_configurations'; id: Mapped[str]=mapped_column(String,primary_key=True,default=uid); campaign_id: Mapped[str|None]=mapped_column(ForeignKey('campaigns.id'),nullable=True); channel: Mapped[str]=mapped_column(String); enabled: Mapped[bool]=mapped_column(Boolean,default=True)
class AuditLog(Base, Timestamped):
    __tablename__='audit_logs'; id: Mapped[str]=mapped_column(String,primary_key=True,default=uid); action: Mapped[str]=mapped_column(String); entity_type: Mapped[str]=mapped_column(String); entity_id: Mapped[str]=mapped_column(String); details: Mapped[dict]=mapped_column(JSON,default=dict)
