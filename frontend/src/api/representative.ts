import { apiClient } from './client';

export const representativeApi = {
  workspace: () => apiClient.get<any>('/api/rep/workspace'),
  approve: (id: string) => apiClient.post(`/api/rep/approvals/${id}/approve`),
  editApprove: (id: string, content: string) => apiClient.post(`/api/rep/approvals/${id}/edit-approve`, { content }),
  reject: (id: string, reason: string) => apiClient.post(`/api/rep/approvals/${id}/reject`, { reason }),
  batchApprove: (approvalIds: string[]) => apiClient.post<Array<{ approval_id: string; allowed: boolean; reason_code?: string; message?: string }>>('/api/rep/approvals/batch-approve', { approval_ids: approvalIds }),
  approvalContext: (id: string) => apiClient.get<{
    agent: string; prompt_version: string | null; agent_run: any;
    rag_context: Array<{ document_id: string; title: string; content: string; category?: string; score?: number }>;
    prospect_summary?: string | null; research_snippet?: string | null;
  }>(`/api/rep/approvals/${id}/context`),
  monitoring: () => apiClient.get<any>('/api/rep/monitoring'),
  campaignDetail: (id: string) => apiClient.get<any>(`/api/rep/campaigns/${id}`),
};
