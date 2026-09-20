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
  selectProspects: async (id: string, prospectIds: string[]): Promise<{ selected: string[]; rejected: any[] }> => {
    return await apiClient.post<{ selected: string[]; rejected: any[] }>(`/api/manager/campaigns/${id}/prospects/select`, {
      prospect_ids: prospectIds,
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
};

