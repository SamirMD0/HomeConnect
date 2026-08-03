import { useQuery, useQueryClient } from '@tanstack/react-query';
import { dashboardApi } from '../api/dashboard.api';
import type { DashboardQueryParams } from '../types';
import { dashboardQueryKeys } from './dashboard.queryKeys';

export function useDashboardOverview(query: DashboardQueryParams) {
  return useQuery({ queryKey: dashboardQueryKeys.overview(query), queryFn: () => dashboardApi.getOverview(query), refetchInterval: 30_000 });
}

export function useCustomerAnalytics(query: DashboardQueryParams) {
  return useQuery({ queryKey: dashboardQueryKeys.customer(query), queryFn: () => dashboardApi.getCustomerFinancial(query), refetchInterval: 60_000 });
}

export function useSupplierAnalytics(query: DashboardQueryParams) {
  return useQuery({ queryKey: dashboardQueryKeys.supplier(query), queryFn: () => dashboardApi.getSupplierFinancial(query), refetchInterval: 60_000 });
}

export function useServiceAnalytics(query: DashboardQueryParams) {
  return useQuery({ queryKey: dashboardQueryKeys.service(query), queryFn: () => dashboardApi.getServiceSummary(query), refetchInterval: 60_000 });
}

export function useSalesAnalytics(query: DashboardQueryParams) {
  return useQuery({ queryKey: dashboardQueryKeys.sales(query), queryFn: () => dashboardApi.getSalesSummary(query), refetchInterval: 60_000 });
}

export function useProductAnalytics(query: DashboardQueryParams) {
  return useQuery({ queryKey: dashboardQueryKeys.product(query), queryFn: () => dashboardApi.getProductSummary(query), refetchInterval: 300_000 });
}

export function useDashboardAlerts(query: DashboardQueryParams) {
  return useQuery({ queryKey: dashboardQueryKeys.alerts(query), queryFn: () => dashboardApi.getAlerts(query), refetchInterval: 60_000 });
}

export function useMonthEnd(month: string, enabled = true) {
  return useQuery({ queryKey: dashboardQueryKeys.monthEnd(month), queryFn: () => dashboardApi.getMonthEnd(month), enabled, staleTime: 60_000 });
}

export function useDashboardActivity(limit = 15) {
  return useQuery({ queryKey: dashboardQueryKeys.activity(limit), queryFn: () => dashboardApi.getActivity(limit), refetchInterval: 30_000 });
}

export function useRefreshDashboard() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: dashboardQueryKeys.all });
}

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
