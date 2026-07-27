import { api } from '../../../services/api';
import { ActivityLog, DashboardFinancialSummary } from '../types';

export const dashboardApi = {
  getFinancialSummary: async (): Promise<DashboardFinancialSummary> => {
    const response = await api.get('/dashboard/financial-summary');
    return response.data.data;
  },

  getRecentActivity: async (): Promise<ActivityLog[]> => {
    const response = await api.get('/dashboard/recent-activity');
    return response.data.data;
  },
};
