import { apiClient } from './client';
import {
  RepresentativeItem,
  RepresentativeDetailResponse,
  CreateRepresentativePayload,
} from '../types';

export const representativesApi = {
  // Get all representatives
  getRepresentatives: async (): Promise<RepresentativeItem[]> => {
    return await apiClient.get<RepresentativeItem[]>('/team/representatives');
  },

  // Get monitoring metrics (includes outreach_sent)
  getMonitoringRepresentatives: async (): Promise<RepresentativeItem[]> => {
    return await apiClient.get<RepresentativeItem[]>('/monitoring/representatives');
  },

  // Get single representative detail with assigned campaigns & approvals workload
  getRepresentativeDetail: async (id: string): Promise<RepresentativeDetailResponse> => {
    return await apiClient.get<RepresentativeDetailResponse>(`/team/representatives/${id}`);
  },

  // Create representative (POST /team/representatives)
  createRepresentative: async (
    data: CreateRepresentativePayload
  ): Promise<{ user: any; profile: any }> => {
    return await apiClient.post<{ user: any; profile: any }>('/team/representatives', data);
  },

  // Update representative (PATCH /team/representatives/{id})
  updateRepresentative: async (
    id: string,
    data: Partial<CreateRepresentativePayload> & { active?: boolean }
  ): Promise<{ user: any; profile: any }> => {
    return await apiClient.patch<{ user: any; profile: any }>(`/team/representatives/${id}`, data);
  },

  // Get approvals summary
  getApprovalsSummary: async (): Promise<{
    total_pending: number;
    aging_count: number;
    oldest_age_hours: number;
    aging_threshold_hours: number;
    by_representative: Array<{
      representative_id: string;
      representative: string;
      pending: number;
      aging: number;
      campaign_ids: string[];
    }>;
  }> => {
    return await apiClient.get('/api/manager/approvals/summary');
  },
};
