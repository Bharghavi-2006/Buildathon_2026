import { apiClient } from './client';
import {
  Campaign,
  ManagerDashboardResponse,
  AlertItem,
  CampaignProspectItem,
  CampaignAgentItem,
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
};
