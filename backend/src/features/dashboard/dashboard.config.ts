export const DASHBOARD_ALERT_THRESHOLDS = {
  largeCustomerBalance: '1000.00',
  agingServiceJobDays: 30,
  companyServiceJobDays: 14,
  readyForPickupDays: 7,
} as const;

export const DASHBOARD_CACHE_TTL_MS = {
  overview: 20_000,
  customerFinancial: 45_000,
  supplierFinancial: 45_000,
  serviceSummary: 45_000,
  productSummary: 300_000,
  salesSummary: 45_000,
  alerts: 45_000,
  activity: 20_000,
  currentMonthEnd: 60_000,
  closedMonthEnd: 900_000,
} as const;

export const DASHBOARD_ACTIVITY_LIMIT = 15;
export const DASHBOARD_TOP_RECORD_LIMIT = 8;
