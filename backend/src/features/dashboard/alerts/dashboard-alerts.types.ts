export type DashboardAlertSeverity = 'warning' | 'serious' | 'critical';

export interface DashboardAlertOffender {
  id: string;
  label: string;
  amount?: string;
  route: string;
}

export interface DashboardAlert {
  key: string;
  severity: DashboardAlertSeverity;
  label: { en: string; ar: string };
  count: number;
  amount?: string;
  route: string;
  offenders: DashboardAlertOffender[];
}

export interface DashboardAlertsData {
  alerts: DashboardAlert[];
  total: number;
}

