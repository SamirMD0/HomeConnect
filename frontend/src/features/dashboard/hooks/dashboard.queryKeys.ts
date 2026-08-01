import type { DashboardQueryParams } from '../types';

export const dashboardQueryKeys = {
  all: ['dashboard'] as const,
  overview: (query: DashboardQueryParams) => [...dashboardQueryKeys.all, 'overview', query] as const,
  customer: (query: DashboardQueryParams) => [...dashboardQueryKeys.all, 'customer-financial', query] as const,
  supplier: (query: DashboardQueryParams) => [...dashboardQueryKeys.all, 'supplier-financial', query] as const,
  service: (query: DashboardQueryParams) => [...dashboardQueryKeys.all, 'service-summary', query] as const,
  product: (query: DashboardQueryParams) => [...dashboardQueryKeys.all, 'product-summary', query] as const,
  alerts: (query: DashboardQueryParams) => [...dashboardQueryKeys.all, 'alerts', query] as const,
  monthEnd: (month: string) => [...dashboardQueryKeys.all, 'month-end', month] as const,
  activity: (limit = 15) => [...dashboardQueryKeys.all, 'activity', limit] as const,
};

