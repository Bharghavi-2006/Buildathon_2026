import { apiClient } from './client';

export const hurdlesApi = {
  list: () => apiClient.get<any[]>('/api/rep/hurdles'),
  detail: (id: string) => apiClient.get<any>(`/api/rep/hurdles/${id}`),
  resolve: (id: string, note: string) => apiClient.post<any>(`/api/rep/hurdles/${id}/resolve`, { note }),
  escalate: (id: string) => apiClient.post<any>(`/api/rep/hurdles/${id}/escalate`),
  flagKnowledgeGap: (id: string) => apiClient.post<{ flag_id: string; category: string; count_this_week: number }>(`/api/rep/hurdles/${id}/flag-knowledge-gap`),
  attachKnowledge: (id: string, title: string, content: string) => apiClient.post<any>(`/api/rep/hurdles/${id}/knowledge`, { title, content }),
};

export const guardrailsApi = {
  get: () => apiClient.get<any>('/api/rep/guardrails'),
};
