import { apiClient } from './client';
import { CurrentUser } from '../types';

export const authApi = {
  getMe: async (): Promise<CurrentUser> => {
    return await apiClient.get<CurrentUser>('/me');
  },
  getHealth: async (): Promise<{ status: string; demo_mode: boolean; database: string }> => {
    return await apiClient.get('/health');
  },
};
