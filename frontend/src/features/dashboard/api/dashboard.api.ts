import { api } from '../../../services/api';
import { DashboardSummary, ActivityLog } from '../types';

export const dashboardApi = {
  getSummary: async (): Promise<DashboardSummary> => {
    const response = await api.get('/dashboard/summary');
    return response.data.data;
  },

  getRecentActivity: async (): Promise<ActivityLog[]> => {
    const response = await api.get('/dashboard/recent-activity');
    return response.data.data;
  },
};
