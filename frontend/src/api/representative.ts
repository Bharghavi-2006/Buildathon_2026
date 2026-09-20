import { apiClient } from './client';

export const representativeApi = {
  workspace: () => apiClient.get<any>('/api/rep/workspace'),
  approve: (id: string) => apiClient.post(`/api/rep/approvals/${id}/approve`),
  editApprove: (id: string, content: string) => apiClient.post(`/api/rep/approvals/${id}/edit-approve`, { content }),
  reject: (id: string, reason: string) => apiClient.post(`/api/rep/approvals/${id}/reject`, { reason }),
};
