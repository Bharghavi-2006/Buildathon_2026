import { apiClient } from './client';

export const controlApi = {
  getKillSwitch: async (): Promise<{ global_kill_switch: boolean }> => {
    return await apiClient.get<{ global_kill_switch: boolean }>('/control/kill-switch');
  },
  enableKillSwitch: async (): Promise<{ global_kill_switch: boolean; message: string }> => {
    return await apiClient.post<{ global_kill_switch: boolean; message: string }>('/control/kill-switch');
  },
  resetKillSwitch: async (): Promise<{ global_kill_switch: boolean }> => {
    return await apiClient.post<{ global_kill_switch: boolean }>('/control/kill-switch/reset');
  },
};
