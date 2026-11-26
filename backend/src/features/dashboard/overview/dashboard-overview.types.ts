export type DashboardKpiValueKind = 'money' | 'count';

export interface DashboardKpi {
  key: string;
  value: string | number;
  valueKind: DashboardKpiValueKind;
  goodDirection: 'up' | 'down' | 'neutral';
  route: string;
  sparkline: Array<{ bucket: string; value: string | number }>;
  /** Money figures shown under the main value, e.g. deposits held beside outstanding debt. */
  breakdown?: Array<{ key: 'depositsHeld' | 'netBalance'; value: string }>;
}

export interface DashboardOverviewData {
  inventoryScope?: 'all-branches';
  kpis: [DashboardKpi, DashboardKpi, DashboardKpi, DashboardKpi, DashboardKpi, DashboardKpi, DashboardKpi, DashboardKpi];
  moduleCounts: Record<string, number>;
}
