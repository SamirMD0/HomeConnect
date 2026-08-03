import { api } from '../../../services/api';
import type {
  ActivityLog,
  CustomerAnalyticsData,
  DashboardActivityData,
  DashboardAlertsData,
  DashboardEnvelope,
  DashboardFinancialSummary,
  DashboardOverviewData,
  DashboardQueryParams,
  MonthEndData,
  ProductAnalyticsData,
  SalesAnalyticsData,
  ServiceAnalyticsData,
  SupplierAnalyticsData,
} from '../types';

const dashboardHeaders = (refresh = false) => refresh ? { 'x-dashboard-refresh': 'true' } : undefined;

async function getSection<T>(path: string, params?: object, refresh = false): Promise<DashboardEnvelope<T>> {
  const response = await api.get(`/dashboard/${path}`, { params, headers: dashboardHeaders(refresh) });
  return response.data.data;
}

export const dashboardApi = {
  getOverview: (query: DashboardQueryParams, refresh = false) => getSection<DashboardOverviewData>('overview', query, refresh),
  getCustomerFinancial: (query: DashboardQueryParams, refresh = false) => getSection<CustomerAnalyticsData>('customer-financial', query, refresh),
  getSupplierFinancial: (query: DashboardQueryParams, refresh = false) => getSection<SupplierAnalyticsData>('supplier-financial', query, refresh),
  getServiceSummary: (query: DashboardQueryParams, refresh = false) => getSection<ServiceAnalyticsData>('service-summary', query, refresh),
  getSalesSummary: (query: DashboardQueryParams, refresh = false) => getSection<SalesAnalyticsData>('sales-summary', query, refresh),
  getProductSummary: (query: DashboardQueryParams, refresh = false) => getSection<ProductAnalyticsData>('product-summary', query, refresh),
  getAlerts: (query: DashboardQueryParams, refresh = false) => getSection<DashboardAlertsData>('alerts', query, refresh),
  getMonthEnd: (month: string, refresh = false) => getSection<MonthEndData>('month-end', { month }, refresh),
  getActivity: (limit = 15, refresh = false) => getSection<DashboardActivityData>('activity', { limit }, refresh),

  getFinancialSummary: async (): Promise<DashboardFinancialSummary> => {
    const response = await api.get('/dashboard/financial-summary');
    return response.data.data;
  },

  getRecentActivity: async (): Promise<ActivityLog[]> => {
    const response = await api.get('/dashboard/recent-activity');
    return response.data.data?.data?.items ?? response.data.data;
  },
};
