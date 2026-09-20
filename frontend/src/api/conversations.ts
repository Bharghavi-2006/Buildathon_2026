import { apiClient } from './client';

export const conversationsApi = {
  getMessages: (conversationId: string) => apiClient.get<any[]>(`/conversations/${conversationId}/messages`),
  sendReply: (conversationId: string, content: string, channel: string = 'email') =>
    apiClient.post<{ delivery_id: string; delivery_mode: string; conversation_id: string }>(`/conversations/${conversationId}/messages`, { content, channel }),
};
