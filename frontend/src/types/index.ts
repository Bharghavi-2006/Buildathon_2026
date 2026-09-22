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
  supported_channels?: string[];
  timezone?: string;
  working_hours?: Record<string, any>;
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
  demo_mode: boolean;
  demo_recipient_email?: string | null;
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
  open_conversations: number;
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
  representative_id?: string;
  representative_name?: string;
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
  conflict?: { other_campaign_id: string; other_campaign_name: string } | null;
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
  active_campaigns_count?: number;
  pending_approvals?: number;
  aging_approvals?: number;
  active_agent_types?: string[];
  paused_agent_types?: string[];
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

export interface CampaignIdentity {
  id: string;
  name: string;
  description: string;
  status: string;
  owner_id?: string;
}

export interface ManagerUserItem {
  user: User;
  profile: AccessProfile;
}

export interface IcpConfig {
  geography: string;
  target_roles: string[];
  industries: string[];
  company_size: { min?: number; max?: number };
  revenue_range?: Record<string, any>;
  funding_stage?: string[];
  technologies?: string[];
  exclusion_criteria?: string[];
  reference_profiles?: any[];
  custom_criteria?: Record<string, any>;
}

export interface DiscoveryConflict {
  campaign_id: string;
  campaign_name: string;
  status: string;
  last_contacted_at?: string | null;
  blocking: boolean;
}

export interface DiscoveryCandidate {
  prospect_id?: string;
  source_id?: string;
  name: string;
  title: string;
  company?: string;
  fit_score: number;
  fit_reasons: string[];
  matched_criteria?: string[];
  unmatched_criteria?: string[];
  confidence?: string;
  source?: string;
  duplicate?: boolean;
  conflict?: boolean;
  conflicts?: DiscoveryConflict[];
  suppressed?: boolean;
  valid?: boolean;
  reason?: string;
}

export interface DiscoveryResponse {
  run_id: string;
  batch_id: string;
  status: string;
  dronahq_execution_id?: string;
  total_found: number;
  search_summary: string;
  prospects: DiscoveryCandidate[];
}

export interface RepMatchItem {
  representative_id: string;
  representative: User;
  score: number;
  breakdown: {
    icp_fit: number;
    geography_fit: number;
    channel_fit: number;
    capacity: number;
    specialization: number;
    working_hours: number;
  };
  reasons: string[];
  warnings: string[];
  capacity: {
    current_load: number;
    capacity: number;
    utilization_percentage: number;
  };
}

export interface CampaignAssignmentItem {
  assignment: {
    id: string;
    campaign_id: string;
    representative_id: string;
    assigned_by_id: string;
    daily_send_limit?: number;
    assigned_lead_limit?: number;
    working_hours?: Record<string, any>;
    routing_rule?: Record<string, any>;
    active: boolean;
    created_at?: string;
  };
  user: User;
}

export interface CampaignRepConfig {
  routing_strategy?: 'round_robin' | 'stage_split';
  rep_limits?: Record<string, { daily_send_limit?: number; assigned_lead_limit?: number }>;
  [key: string]: any;
}

export interface RepresentativeCampaignAssignment {
  campaign: {
    id: string;
    name: string;
    status: string;
    active_channels?: string[];
    daily_outreach_limit?: number;
    description?: string;
  };
  assignment: {
    id: string;
    campaign_id: string;
    representative_id: string;
    daily_send_limit?: number;
    assigned_lead_limit?: number;
    working_hours?: Record<string, any>;
    routing_rule?: Record<string, any>;
    active: boolean;
    created_at?: string;
  };
  assigned_lead_count: number;
}

export interface RepresentativeDetailResponse {
  user: User;
  profile: AccessProfile;
  active_leads: number;
  available_capacity: number;
  outreach_sent: number;
  campaign_assignments: RepresentativeCampaignAssignment[];
  approvals: {
    pending_count: number;
    aging_count: number;
  };
}

export interface HurdleListItem {
  id: string;
  status: 'ESCALATED' | 'WARNING' | 'RESOLVED';
  category: string;
  channel: string;
  campaign: { id: string; name: string } | null;
  prospect: Prospect | null;
  reason: string;
  recommended_action: string;
  agent_type: string;
  age_hours: number;
  escalated_to_manager: boolean;
  created_at: string;
  updated_at: string;
}

export interface HurdleDetail extends HurdleListItem {
  organization: { id: string; name: string; website?: string; industry?: string } | null;
  policy_decision: { rule: string; reason: string } | null;
  agent_escalated: {
    agent_type: string;
    agent_run_id: string;
    status: string;
    engine_version?: string | null;
    dronahq_execution_id?: string | null;
    output: Record<string, any>;
  } | null;
  conversation: { id: string; status: string; messages: Message[] } | null;
  rag_context: Array<{ document_id: string; title: string; content: string }>;
  voice: {
    call_status?: string | null;
    transcript?: string | null;
    sentiment?: string | null;
    transfer_status?: string | null;
    callback_required?: boolean | null;
    note?: string | null;
  } | null;
  recurring: { count_this_week: number; is_recurring: boolean; already_flagged: boolean };
  resolution: { status: string; resolved_at?: string | null; resolved_by_id?: string | null; resolution_note: string };
}

export interface GuardrailChannel {
  channel: string;
  enabled: boolean;
  daily_used: number;
  daily_limit: number;
  working_hours: Record<string, any>;
  approval_required: boolean;
  availability: 'LIVE' | 'PAUSED' | 'OUTSIDE_WORKING_HOURS' | 'LIMIT_REACHED' | 'BLOCKED_KILL_SWITCH' | 'BLOCKED_CAMPAIGN_PAUSED';
}

export interface GuardrailConflict {
  prospect_id: string;
  prospect_name: string;
  other_campaign_id: string;
  other_campaign_name: string;
  message: string;
}

export interface GuardrailCampaignCard {
  campaign: {
    id: string; name: string; status: string; icp_summary: string;
    daily_outreach_limit: number; approval_required: boolean; demo_mode: boolean;
  };
  restrictions: string[];
  channels: GuardrailChannel[];
  agents_enabled: string[];
  working_hours: Record<string, any>;
  paused_message: string | null;
  conflicts: GuardrailConflict[];
}

export interface GuardrailsResponse {
  kill_switch: { active: boolean; message: string | null };
  representative_profile: { timezone?: string; working_hours?: Record<string, any>; supported_channels?: string[] };
  daily_capacity: { used: number; limit: number; remaining: number; exhausted: boolean; warning: boolean };
  campaigns: GuardrailCampaignCard[];
}

export interface CreateRepresentativePayload {
  name: string;
  email: string;
  max_active_leads: number;
  specialties: string[];
  regions: string[];
  supported_channels: string[];
  timezone: string;
  working_hours?: Record<string, any>;
}

