export type ReceivableTier =
  | 'NO_ACTIVITY'
  | 'CURRENT'
  | 'WATCH'
  | 'LATE'
  | 'SEVERE'
  | 'CRITICAL';

export type ReceivableSortBy = 'standing' | 'outstanding' | 'overdue' | 'name' | 'lastPayment';
export type ReceivableSortOrder = 'asc' | 'desc';

export interface ReceivableCustomerView {
  id: string;
  name: string;
  phone: string;
  isActive: boolean;
}

export interface ReceivableItemView {
  customer: ReceivableCustomerView;
  tier: ReceivableTier;
  tierReason: string;
  maxOverdueDays: number;
  totalObligated: string;
  totalPaid: string;
  outstanding: string;
  overdueAmount: string;
  paidRatioPercent: string;
  billsTotal: number;
  billsPaid: number;
  openDebtCount: number;
  activePlanCount: number;
  overdueItemCount: number;
  nextDueDate: string | null;
  lastPaymentDate: string | null;
  daysSinceLastPayment: number | null;
  paymentCount: number;
}

export interface ReceivablesSummaryView {
  customerCount: number;
  customersWithBalance: number;
  customersOverdue: number;
  atRiskCount: number;
  totalOutstanding: string;
  totalOverdue: string;
}

export type ReceivableTierCounts = Record<ReceivableTier, number>;

export interface ReceivablesResponseView {
  businessDate: string;
  summary: ReceivablesSummaryView;
  tierCounts: ReceivableTierCounts;
  items: ReceivableItemView[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
