export interface DashboardFinancialSummary {
  businessDate: string;
  monthStart: string;
  counts: {
    totalCustomers: number;
    customersWithOutstanding: number;
  };
  money: {
    totalOutstanding: string;
    paymentsToday: string;
    paymentsThisMonth: string;
    obligationsCreatedToday: string;
    obligationsCreatedThisMonth: string;
    netChangeToday: string;
    netChangeThisMonth: string;
  };
  upcomingDue: DashboardUpcomingDueItem[];
  overdueCustomers: DashboardOverdueCustomer[];
  recentPayments: DashboardRecentPayment[];
}

export interface DashboardCustomer {
  id: string;
  name: string;
  phone: string;
}

export interface DashboardUpcomingDueItem {
  type: 'DEBT' | 'INSTALLMENT';
  id: string;
  parentId: string | null;
  customer: DashboardCustomer;
  description: string;
  dueDate: string;
  remainingAmount: string;
  status: string;
}

export interface DashboardOverdueCustomer {
  customer: DashboardCustomer;
  overdueItemCount: number;
  totalOverdue: string;
}

export interface DashboardRecentPayment {
  id: string;
  customer: DashboardCustomer;
  amount: string;
  paymentDate: string;
  paymentMethod: string;
  reference: string | null;
  allocationCount: number;
}

export interface ActivityLog {
  id: string;
  userId: string;
  user: {
    fullName: string;
    username: string;
  };
  action: string;
  entityType: string;
  entityId: string;
  details: Record<string, unknown>;
  ipAddress?: string;
  createdAt: string;
  branchId?: string;
}

export type DashboardRangePreset = 'today' | 'week' | 'month' | 'quarter' | 'year' | 'custom';
export type DashboardGranularity = 'day' | 'week' | 'month';

export interface DashboardQueryParams {
  range?: DashboardRangePreset;
  from?: string;
  to?: string;
  includeArchived?: boolean;
  granularity?: DashboardGranularity;
}

export interface DashboardMeta {
  businessDate: string;
  range: { from: string; to: string; preset: DashboardRangePreset };
  generatedAt: string;
  currency: 'USD';
}

export interface DashboardEnvelope<T> {
  meta: DashboardMeta;
  data: T;
}

export interface DashboardKpi {
  key: 'collectedToday' | 'customersPaidToday' | 'newDebtsToday' | 'outstandingDebt' | 'owedToSuppliers' | 'openServiceJobs' | 'readyForPickup' | 'activeProducts';
  value: string | number;
  valueKind: 'money' | 'count';
  goodDirection: 'up' | 'down' | 'neutral';
  route: string;
  sparkline: Array<{ bucket: string; value: string | number }>;
}

export interface DashboardOverviewData { kpis: DashboardKpi[]; moduleCounts: Record<string, number> }

export interface CustomerAnalyticsData {
  totals: { totalCustomers: number; collected: string; distinctPayers: number; newDebt: string; outstanding: string; customersWithBalance: number; overdueCustomers: number; netMovement: string };
  today: { collected: string; distinctPayers: number; newDebt: string };
  trend: Array<{ bucket: string; collected: string; newDebt: string }>;
  monthlyComparison: Array<{ month: string; collected: string; newDebt: string }>;
  ageDistribution: Array<{ key: string; label: string; amount: string; count: number }>;
  topDebtors?: Array<{ customerId: string; customerName: string; phone: string; outstanding: string }>;
}

export interface SupplierAnalyticsData {
  totals: { owed: string; paid: string; paidToday: string; suppliersWithBalance: number };
  trend: Array<{ bucket: string; paid: string }>;
  topBalances: Array<{ supplierId: string; supplierName: string; companyName: string | null; balance: string }>;
}

export interface ServiceAnalyticsData {
  totals: { all: number; open: number; readyForPickup: number; completed: number; aging: number };
  statusDistribution: Array<{ status: string; label: string; count: number }>;
  throughput: Array<{ bucket: string; opened: number; completed: number }>;
  agingJobs: Array<{ id: string; jobNumber: string; customerName: string; status: string; ageDays: number }>;
}

export interface SalesAnalyticsData {
  totals: {
    salesToday: string;
    ordersToday: number;
    pendingDelivery: number;
    unpaidOrders: number;
    partialPayments: number;
    installmentOrders: number;
  };
  salesByDay: Array<{ date: string; amount: string; orderCount: number }>;
  paymentStatusDistribution: Array<{ status: string; count: number }>;
  fulfillmentStatusDistribution: Array<{ status: string; count: number }>;
  deliveryPipeline: Array<{ status: string; count: number }>;
  topProducts: Array<{ productId: string; productName: string; quantity: number }>;
}

export interface ProductAnalyticsData {
  totals: { active: number; archived: number; missingBarcode: number; missingCost: number; missingPricing: number; ready: number; readinessPercent: number };
  presetUsage: Array<{ presetId: string; presetName: string; productCount: number }>;
}

export interface DashboardAlert {
  key: string;
  severity: 'warning' | 'serious' | 'critical';
  label: { en: string; ar: string };
  count: number;
  amount?: string;
  route: string;
  offenders: Array<{ id: string; label: string; amount?: string; route: string }>;
}
export interface DashboardAlertsData { alerts: DashboardAlert[]; total: number }

export interface MonthEndMovement { opening: string; newAmount: string; collected: string; adjustments: string; closing: string; reconciled: boolean }
export interface MonthEndData {
  month: string;
  disclosure: { en: string; ar: string };
  customers: MonthEndMovement & { withDebt: number; fullyPaid: number; overdue: number };
  suppliers: MonthEndMovement & { withBalance: number };
  service: { opened: number; completed: number; pending: number; cancelled: number; netOpen: number; averageDaysOpen: number };
}

export interface DashboardActivityItem {
  id: string;
  module: 'customers' | 'payments' | 'debts' | 'suppliers' | 'service' | 'products' | 'pricing';
  action: string;
  entityId: string;
  title: string;
  amount?: string;
  occurredAt: string;
  actor: string;
  route: string;
}
export interface DashboardActivityData { items: DashboardActivityItem[] }
