export interface User {
  id: string;
  name: string;
  email: string;
  created_at?: string;
}

export interface AccessProfile {
  id: string;
  user_id: string;
  role: 'MANAGER' | 'REPRESENTATIVE';
  max_active_leads: number;
  specialties: string[];
  regions: string[];
  active: boolean;
}

export interface CurrentUser {
  user: User;
  role: 'MANAGER' | 'REPRESENTATIVE';
  profile: AccessProfile;
}

export interface Campaign {
  id: string;
  name: string;
  description: string;
  status: 'DRAFT' | 'LIVE' | 'PAUSED' | 'COMPLETED' | 'ARCHIVED';
  icp_config: Record<string, any>;
  target_geography: string;
  target_industries: string[];
  target_roles: string[];
  company_size: { min?: number; max?: number };
  instructions: string;
  active_channels: string[];
  daily_outreach_limit: number;
  approval_required: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface DashboardCampaignCard {
  id: string;
  name: string;
  icp_summary: string;
  status: 'DRAFT' | 'LIVE' | 'PAUSED' | 'COMPLETED' | 'ARCHIVED';
  prospect_count: number;
  outreach_sent: number;
  meetings_booked: number;
  created_at: string;
  updated_at: string;
  rep?: string;
}

export interface ManagerDashboardResponse {
  pending_approvals: number;
  replies_needing_attention: number;
  meetings_booked_today: number;
  active_alerts: number;
  campaigns: DashboardCampaignCard[];
}

export interface AlertItem {
  id: string;
  type: string;
  severity: string;
  message: string;
  created_at: string;
}

export interface Prospect {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone?: string;
  linkedin_url?: string;
  title: string;
  company_id?: string;
  location: string;
  industry: string;
  employee_count: number;
  website: string;
  metadata_?: Record<string, any>;
  lifecycle_status: string;
  created_at?: string;
  updated_at?: string;
}

export interface CampaignProspectItem {
  association: {
    id: string;
    campaign_id: string;
    prospect_id: string;
    qualification_status: string;
    qualification_score: number;
    qualification_reason: string;
    current_stage: string;
    last_contacted_at?: string | null;
    next_followup_at?: string | null;
    campaign_specific_context?: Record<string, any>;
  };
  prospect: Prospect;
}

export interface IcpEvidence {
  criterion: string;
  status: 'MATCHED' | 'UNMATCHED' | 'UNVERIFIED';
  evidence: string;
  source?: string;
}

export interface ProspectResearch {
  id: string;
  campaign_id: string;
  prospect_id: string;
  status: 'verified' | 'partially_verified' | 'unverified';
  research_summary: string;
  person_research: Record<string, any>;
  company_research: Record<string, any>;
  icp_evidence: IcpEvidence[];
  business_context: string[];
  personalization_signals: string[];
  sources: string[];
  uncertainties: string[];
  agent_run_id?: string;
  created_at?: string;
  updated_at?: string;
}

export interface FitmentCriterion {
  criterion: string;
  status: 'MATCHED' | 'UNMATCHED' | 'UNVERIFIED';
  expected_value: any;
  actual_value: any;
  reason: string;
}

export interface ProspectFitment {
  id: string;
  campaign_id: string;
  prospect_id: string;
  organization_fit_score: number;
  organization_fit_status: string;
  organization_criteria: FitmentCriterion[];
  contact_fit_score: number;
  contact_fit_status: string;
  contact_criteria: FitmentCriterion[];
  overall_fit_score: number;
  overall_fit_status: string;
  recommended_next_stage: string;
  key_fit_signals: string[];
  key_risk_factors: string[];
  uncertainties: string[];
  research_id: string;
  engine_version: string;
  created_at?: string;
  updated_at?: string;
}

export interface ApprovalView {
  id: string;
  campaign: { id: string; name: string };
  prospect: Prospect | null;
  channel: string;
  generated_message: string;
  priority: 'HIGH' | 'NORMAL' | 'LOW';
  intent: string;
  agent: string;
  prompt_version?: string;
  source_references: string[];
  created_at: string;
  status: string;
}

export interface RepresentativeItem {
  user: User;
  profile: AccessProfile;
  active_leads: number;
  available_capacity: number;
  outreach_sent?: number;
}

export interface CampaignAgentItem {
  agent: {
    id: string;
    campaign_id: string;
    agent_type: string;
    enabled: boolean;
    created_at?: string;
  };
  configuration?: {
    id: string;
    campaign_agent_id: string;
    responsibilities: string[];
    decision_thresholds: Record<string, any>;
    escalation_rules: Record<string, any>;
    prompt_version_id?: string | null;
  } | null;
}

export interface ChannelSetting {
  id?: string;
  campaign_id?: string;
  channel: string;
  enabled: boolean;
  daily_limit: number;
  working_hours?: Record<string, any>;
  approval_required?: boolean;
}

export interface PromptVersionItem {
  id: string;
  agent_type: string;
  version: string;
  prompt_text: string;
  configuration: Record<string, any>;
  active: boolean;
}

export interface LaunchCheckResponse {
  ready: boolean;
  checks: Array<{
    key: string;
    label: string;
    passed: boolean;
  }>;
}

export interface RepPerformance {
  representative_id: string;
  assigned_leads: number;
  outreach_sent: number;
  pending_approvals: number;
}

export interface Conversation {
  id: string;
  prospect_id: string;
  campaign_id?: string;
  status: 'OPEN' | 'MEETING_INTENT' | 'CLOSED';
  created_at?: string;
  updated_at?: string;
  prospect?: Prospect;
  last_message?: Message;
}

export interface Message {
  id: string;
  conversation_id: string;
  direction: 'INBOUND' | 'OUTBOUND';
  channel: string;
  content: string;
  subject?: string;
  created_at?: string;
}

export interface AgentRun {
  id: string;
  campaign_id: string;
  prospect_id?: string;
  agent_type: string;
  status: 'RUNNING' | 'COMPLETED' | 'FAILED' | 'SKIPPED';
  input_data: Record<string, any>;
  output_data: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface KnowledgeDocument {
  id: string;
  title: string;
  content: string;
  category: string;
  created_at?: string;
  updated_at?: string;
}
