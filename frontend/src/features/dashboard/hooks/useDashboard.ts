import { useQuery } from '@tanstack/react-query';
import { dashboardApi } from '../api/dashboard.api';

export function useFinancialSummary() {
  return useQuery({
    queryKey: ['dashboard', 'financial-summary'],
    queryFn: dashboardApi.getFinancialSummary,
    refetchInterval: 30000,
  });
}

export function useRecentActivity() {
  return useQuery({
    queryKey: ['dashboard', 'recentActivity'],
    queryFn: dashboardApi.getRecentActivity,
    refetchInterval: 30000, // Auto-refresh every 30 seconds
  });
}
