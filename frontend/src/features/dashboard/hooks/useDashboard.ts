import { useQuery } from '@tanstack/react-query';
import { dashboardApi } from '../api/dashboard.api';

export function useDashboardSummary() {
  return useQuery({
    queryKey: ['dashboard', 'summary'],
    queryFn: dashboardApi.getSummary,
    refetchInterval: 30000, // Auto-refresh every 30 seconds
  });
}

export function useRecentActivity() {
  return useQuery({
    queryKey: ['dashboard', 'recentActivity'],
    queryFn: dashboardApi.getRecentActivity,
    refetchInterval: 30000, // Auto-refresh every 30 seconds
  });
}
