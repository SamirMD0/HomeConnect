import type { BusinessDate } from '../financial';
export type { SalesAnalyticsData } from './sales/sales-analytics.types';

export type DashboardRangePreset = 'today' | 'week' | 'month' | 'quarter' | 'year' | 'custom';
export type DashboardGranularity = 'day' | 'week' | 'month';

export interface DashboardRange {
  from: BusinessDate;
  to: BusinessDate;
  preset: DashboardRangePreset;
  granularity: DashboardGranularity;
}

export interface ResolvedDashboardRange extends DashboardRange {
  previousFrom: BusinessDate;
  previousTo: BusinessDate;
}

export interface DashboardMeta {
  businessDate: BusinessDate;
  range: Pick<DashboardRange, 'from' | 'to' | 'preset'>;
  generatedAt: string;
  currency: 'USD';
}

export interface DashboardQuery {
  range: DashboardRangePreset;
  from?: string;
  to?: string;
  includeArchived: boolean;
  granularity?: DashboardGranularity;
}

export interface DashboardEnvelope<T> {
  meta: DashboardMeta;
  data: T;
}
