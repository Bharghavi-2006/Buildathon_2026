import { apiClient } from './client';
import {
  Campaign,
  ManagerDashboardResponse,
  AlertItem,
  CampaignProspectItem,
  CampaignAgentItem,
  CampaignIdentity,
  ManagerUserItem,
  IcpConfig,
  DiscoveryResponse,
  DiscoveryCandidate,
  ChannelSetting,
  PromptVersionItem,
  LaunchCheckResponse,
  RepresentativeItem,
  RepMatchItem,
  CampaignAssignmentItem,
  CampaignRepConfig,
} from '../types';

export const campaignsApi = {
  getDashboard: async (): Promise<ManagerDashboardResponse> => {
    return await apiClient.get<ManagerDashboardResponse>('/api/manager/dashboard');
  },
  getAlerts: async (): Promise<AlertItem[]> => {
    return await apiClient.get<AlertItem[]>('/api/manager/alerts');
  },
  getAgingApprovals: async (): Promise<Array<{
    approval_id: string;
    representative: { id: string; name: string };
    campaign: { id: string; name: string };
    prospect: any;
    age_hours: number;
    channel: string;
    message_preview: string;
    created_at: string;
    status: string;
  }>> => {
    return await apiClient.get('/api/manager/approvals/aging');
  },
  getApprovalsSummary: async (): Promise<{
    total_pending: number;
    aging_count: number;
    oldest_age_hours: number;
    aging_threshold_hours: number;
    by_representative: Array<{ representative_id: string; representative: string; pending: number; aging: number; campaign_ids: string[] }>;
  }> => {
    return await apiClient.get('/api/manager/approvals/summary');
  },
  getCampaignConversations: async (id: string): Promise<Array<{
    id: string; prospect_id: string; campaign_id?: string; status: string; created_at?: string; updated_at?: string;
    prospect: any; last_message: any;
  }>> => {
    return await apiClient.get(`/campaigns/${id}/conversations`);
  },
  getCampaign: async (id: string): Promise<Campaign> => {
    return await apiClient.get<Campaign>(`/campaigns/${id}`);
  },
  getCampaignAnalytics: async (id: string): Promise<{ campaign_id: string; outreach_sent: number; qualified_prospects: number; channel_performance: Record<string, number> }> => {
    return await apiClient.get(`/campaigns/${id}/analytics`);
  },
  getCampaignProspects: async (id: string): Promise<CampaignProspectItem[]> => {
    return await apiClient.get<CampaignProspectItem[]>(`/campaigns/${id}/prospects`);
  },
  getCampaignAgents: async (id: string): Promise<CampaignAgentItem[]> => {
    return await apiClient.get<CampaignAgentItem[]>(`/api/manager/campaigns/${id}/agents`);
  },
  toggleCampaignPause: async (id: string, action: 'pause' | 'resume'): Promise<Campaign> => {
    return await apiClient.post<Campaign>(`/api/manager/campaigns/${id}/${action}`);
  },
  toggleAgent: async (id: string, agentId: string, action: 'pause' | 'resume'): Promise<any> => {
    return await apiClient.post(`/api/manager/campaigns/${id}/agents/${agentId}/${action}`);
  },

  // Wizard Step 1: Identity & Managers
  getManagers: async (): Promise<ManagerUserItem[]> => {
    return await apiClient.get<ManagerUserItem[]>('/team/managers');
  },
  createDraftCampaign: async (data: { name: string; description?: string }): Promise<Campaign> => {
    return await apiClient.post<Campaign>('/api/manager/campaigns', data);
  },
  getCampaignIdentity: async (id: string): Promise<CampaignIdentity> => {
    return await apiClient.get<CampaignIdentity>(`/api/manager/campaigns/${id}/identity`);
  },
  updateCampaignIdentity: async (id: string, data: { name: string; description: string; owner_id: string }): Promise<Campaign> => {
    return await apiClient.patch<Campaign>(`/api/manager/campaigns/${id}/identity`, data);
  },

  // Wizard Step 2: Targeting / ICP
  getCampaignIcp: async (id: string): Promise<IcpConfig> => {
    return await apiClient.get<IcpConfig>(`/api/manager/campaigns/${id}/icp`);
  },
  updateCampaignIcp: async (id: string, data: IcpConfig): Promise<IcpConfig> => {
    return await apiClient.patch<IcpConfig>(`/api/manager/campaigns/${id}/icp`, data);
  },

  // Wizard Step 3: Agents
  configureAgent: async (
    id: string,
    agentId: string,
    data: {
      enabled: boolean;
      responsibilities?: string[];
      decision_thresholds?: Record<string, any>;
      escalation_rules?: Record<string, any>;
      prompt_version_id?: string | null;
    }
  ): Promise<any> => {
    return await apiClient.patch(`/api/manager/campaigns/${id}/agents/${agentId}`, {
      enabled: data.enabled,
      responsibilities: data.responsibilities || [],
      decision_thresholds: data.decision_thresholds || {},
      escalation_rules: data.escalation_rules || {},
      prompt_version_id: data.prompt_version_id ?? null,
    });
  },

  // Wizard Step 4: Prospect Sourcing
  discoverProspects: async (id: string, requestedCount: number = 25): Promise<DiscoveryResponse> => {
    return await apiClient.post<DiscoveryResponse>(`/api/manager/campaigns/${id}/prospects/discover`, {
      requested_count: requestedCount,
    });
  },
  importProspects: async (id: string, prospects: any[]): Promise<{ batch_id: string; count: number }> => {
    return await apiClient.post<{ batch_id: string; count: number }>(`/api/manager/campaigns/${id}/prospects/import`, {
      prospects,
    });
  },
  getProspectsPreview: async (id: string): Promise<DiscoveryCandidate[]> => {
    return await apiClient.get<DiscoveryCandidate[]>(`/api/manager/campaigns/${id}/prospects/preview`);
  },
  approveProspectBatch: async (id: string): Promise<{ approved_batches: number }> => {
    return await apiClient.post<{ approved_batches: number }>(`/api/manager/campaigns/${id}/prospects/approve-batch`);
  },
  selectProspects: async (id: string, prospectIds: string[], minFitScore?: number): Promise<{ selected: string[]; rejected: any[] }> => {
    return await apiClient.post<{ selected: string[]; rejected: any[] }>(`/api/manager/campaigns/${id}/prospects/select`, {
      prospect_ids: prospectIds,
      ...(minFitScore !== undefined ? { min_fit_score: minFitScore } : {}),
    });
  },

  // Wizard Step 5: Channels & Prompts
  getChannels: async (id: string): Promise<ChannelSetting[]> => {
    return await apiClient.get<ChannelSetting[]>(`/api/manager/campaigns/${id}/channels`);
  },
  updateChannels: async (id: string, channels: ChannelSetting[]): Promise<ChannelSetting[]> => {
    return await apiClient.patch<ChannelSetting[]>(`/api/manager/campaigns/${id}/channels`, { channels });
  },
  getPrompts: async (id: string): Promise<PromptVersionItem[]> => {
    return await apiClient.get<PromptVersionItem[]>(`/api/manager/campaigns/${id}/prompts`);
  },
  createPrompt: async (id: string, data: { agent_type: string; prompt_text: string; configuration?: Record<string, any> }): Promise<PromptVersionItem> => {
    return await apiClient.post<PromptVersionItem>(`/api/manager/campaigns/${id}/prompts`, {
      agent_type: data.agent_type,
      prompt_text: data.prompt_text,
      configuration: data.configuration || {},
    });
  },
  activatePrompt: async (id: string, promptId: string): Promise<PromptVersionItem> => {
    return await apiClient.post<PromptVersionItem>(`/api/manager/campaigns/${id}/prompts/${promptId}/activate`);
  },

  // Wizard Step 6: Representatives
  getRepMatches: async (campaignId: string): Promise<RepMatchItem[]> => {
    return await apiClient.get<RepMatchItem[]>(`/api/manager/campaigns/${campaignId}/rep-matches`);
  },
  getRepresentatives: async (): Promise<RepresentativeItem[]> => {
    return await apiClient.get<RepresentativeItem[]>('/team/representatives');
  },
  getAssignedRepresentatives: async (campaignId: string): Promise<CampaignAssignmentItem[]> => {
    return await apiClient.get<CampaignAssignmentItem[]>(`/campaigns/${campaignId}/representatives`);
  },
  assignRepresentative: async (
    campaignId: string,
    data: {
      representative_id: string;
      daily_send_limit?: number;
      assigned_lead_limit?: number;
      working_hours?: Record<string, any>;
      routing_rule?: Record<string, any>;
    }
  ): Promise<any> => {
    return await apiClient.post(`/campaigns/${campaignId}/representatives`, data);
  },
  removeRepresentative: async (campaignId: string, repId: string): Promise<any> => {
    return await apiClient.delete(`/campaigns/${campaignId}/representatives/${repId}`);
  },
  getRepConfig: async (campaignId: string): Promise<CampaignRepConfig> => {
    return await apiClient.get<CampaignRepConfig>(`/api/manager/campaigns/${campaignId}/representatives-config`);
  },
  saveRepConfig: async (campaignId: string, config: CampaignRepConfig): Promise<CampaignRepConfig> => {
    return await apiClient.patch<CampaignRepConfig>(`/api/manager/campaigns/${campaignId}/representatives-config`, config);
  },
  assignLeadToRep: async (campaignId: string, prospectId: string, representativeId: string): Promise<any> => {
    return await apiClient.post(`/campaigns/${campaignId}/prospects/${prospectId}/assign`, { representative_id: representativeId });
  },

  // Wizard Step 7: Launch Check & Activation
  getLaunchCheck: async (id: string): Promise<LaunchCheckResponse> => {
    return await apiClient.get<LaunchCheckResponse>(`/api/manager/campaigns/${id}/launch-check`);
  },
  activateCampaign: async (id: string): Promise<Campaign> => {
    return await apiClient.post<Campaign>(`/api/manager/campaigns/${id}/activate`);
  },
  updateDemoMode: async (id: string, data: { demo_mode: boolean; demo_recipient_email?: string | null }): Promise<{ demo_mode: boolean; demo_recipient_email?: string | null }> => {
    return await apiClient.patch(`/api/manager/campaigns/${id}/demo-mode`, data);
  },

  // Campaign Detail: reply on an existing (even paused-campaign) conversation
  sendConversationReply: async (conversationId: string, content: string, channel: string = 'email'): Promise<{ delivery_id: string; delivery_mode: string; conversation_id: string }> => {
    return await apiClient.post(`/conversations/${conversationId}/messages`, { content, channel });
  },
  getConversationMessages: async (conversationId: string): Promise<any[]> => {
    return await apiClient.get(`/conversations/${conversationId}/messages`);
  },

  // Campaign Detail: who's working this campaign, and the prospect each rep is in talks with
  getCampaignTeam: async (id: string): Promise<Array<{
    representative: { id: string; name: string; email: string };
    assignment: { id: string; daily_send_limit?: number; assigned_lead_limit?: number; working_hours?: Record<string, any> };
    leads: Array<{ prospect: any; stage: string; qualification_status: string; conversation_status: string | null }>;
  }>> => {
    return await apiClient.get(`/api/manager/campaigns/${id}/team`);
  },

  // Settings: suppression / DNC
  getSuppressionList: async (): Promise<Array<{ entry: { id: string; reason: string; active: boolean; created_at: string }; prospect: any }>> => {
    return await apiClient.get('/api/manager/suppression');
  },
  addSuppression: async (prospectEmail: string, reason: string): Promise<any> => {
    return await apiClient.post('/api/manager/suppression', { prospect_email: prospectEmail, reason });
  },
  removeSuppression: async (entryId: string): Promise<{ status: string }> => {
    return await apiClient.delete(`/api/manager/suppression/${entryId}`);
  },

  // Settings: notification thresholds
  getNotificationThresholds: async (): Promise<{ approval_aging_threshold_hours: number; capacity_alert_threshold_pct: number }> => {
    return await apiClient.get('/api/manager/notification-thresholds');
  },
  updateNotificationThresholds: async (data: { approval_aging_threshold_hours: number; capacity_alert_threshold_pct: number }): Promise<{ approval_aging_threshold_hours: number; capacity_alert_threshold_pct: number }> => {
    return await apiClient.patch('/api/manager/notification-thresholds', data);
  },

  // Settings: team / permissions
  getTeamPermissions: async (): Promise<Array<{ user: { id: string; name: string; email: string }; profile: { active: boolean } }>> => {
    return await apiClient.get('/api/manager/team-permissions');
  },
  grantManagerAccess: async (name: string, email: string): Promise<any> => {
    return await apiClient.post('/api/manager/team-permissions', { name, email });
  },
  revokeManagerAccess: async (userId: string): Promise<{ status: string }> => {
    return await apiClient.delete(`/api/manager/team-permissions/${userId}`);
  },

  // Settings: read-only integration/agent status (environment-managed, not editable here)
  getIntegrationsStatus: async (): Promise<{ llm_provider: string; demo_mode: boolean; agents: Record<string, string> }> => {
    return await apiClient.get('/api/manager/integrations-status');
  },

  // Sender bots: draft outreach on a specific channel through the agent pipeline
  // (demo fallback when no webhook is configured) and queue it for rep approval.
  generateDrafts: async (id: string, channel: 'email' | 'linkedin' | 'sms', limit: number = 10): Promise<{ channel: string; drafted: string[]; skipped: Array<{ prospect_id: string; reason: string }> }> => {
    return await apiClient.post(`/api/manager/campaigns/${id}/generate-drafts`, { channel, limit });
  },

  // Simulated Voice SDR call -- explicitly DEMO/SIMULATED, never a real telephony call.
  simulateVoiceCall: async (campaignId: string, prospectId: string): Promise<{
    conversation_id: string; call_status: string;
    transcript: Array<{ speaker: string; text: string }>;
    intent: string; outcome: string; policy: string; human_escalation: boolean;
  }> => {
    return await apiClient.post(`/api/manager/campaigns/${campaignId}/prospects/${prospectId}/demo-voice-call`);
  },
};
