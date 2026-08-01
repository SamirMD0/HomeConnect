export type DashboardKpiValueKind = 'money' | 'count';

export interface DashboardKpi {
  key: string;
  value: string | number;
  valueKind: DashboardKpiValueKind;
  goodDirection: 'up' | 'down' | 'neutral';
  route: string;
  sparkline: Array<{ bucket: string; value: string | number }>;
}

export interface DashboardOverviewData {
  kpis: [DashboardKpi, DashboardKpi, DashboardKpi, DashboardKpi, DashboardKpi, DashboardKpi, DashboardKpi, DashboardKpi];
  moduleCounts: Record<string, number>;
}
