import { apiClient } from './client';

export const representativeApi = {
  workspace: () => apiClient.get<any>('/api/rep/workspace'),
  approve: (id: string) => apiClient.post(`/api/rep/approvals/${id}/approve`),
  editApprove: (id: string, content: string) => apiClient.post(`/api/rep/approvals/${id}/edit-approve`, { content }),
  reject: (id: string, reason: string) => apiClient.post(`/api/rep/approvals/${id}/reject`, { reason }),
  approvalContext: (id: string) => apiClient.get<{ agent: string; prompt_version: string | null; agent_run: any; rag_context: Array<{ document_id: string; title: string; content: string; category?: string; score?: number }> }>(`/api/rep/approvals/${id}/context`),
};
