import { apiClient } from './client';
import { CurrentUser } from '../types';

export const authApi = {
  getMe: async (): Promise<CurrentUser> => {
    return await apiClient.get<CurrentUser>('/me');
  },
  getHealth: async (): Promise<{ status: string; demo_mode: boolean; database: string }> => {
    return await apiClient.get('/health');
  },
  // Demo authentication only -- a fixed password map around the existing X-User-Email
  // RBAC boundary. Not JWT/OIDC; do not treat this as production auth.
  demoLogin: async (email: string, password: string): Promise<{
    authenticated: boolean;
    user: { email: string; name: string; role: 'manager' | 'representative'; representative_id: string | null };
  }> => {
    return await apiClient.post('/auth/demo-login', { email, password });
  },
};
