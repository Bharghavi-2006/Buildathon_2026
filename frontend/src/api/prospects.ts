import { apiClient } from './client';
import { Prospect, ProspectResearch, ProspectFitment } from '../types';

export const prospectsApi = {
  getProspect: async (id: string): Promise<Prospect> => {
    return await apiClient.get<Prospect>(`/prospects/${id}`);
  },
  getResearch: async (campaignId: string, prospectId: string, forceRefresh = false): Promise<ProspectResearch> => {
    return await apiClient.post<ProspectResearch>(
      `/api/manager/campaigns/${campaignId}/prospects/${prospectId}/research`,
      { force_refresh: forceRefresh }
    );
  },
  getFitment: async (campaignId: string, prospectId: string, forceRefresh = false): Promise<ProspectFitment> => {
    return await apiClient.post<ProspectFitment>(
      `/api/manager/campaigns/${campaignId}/prospects/${prospectId}/fitment`,
      { force_refresh: forceRefresh }
    );
  },
};
