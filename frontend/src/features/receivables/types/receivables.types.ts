export type ReceivableTier =
  | 'NO_ACTIVITY'
  | 'CURRENT'
  | 'WATCH'
  | 'LATE'
  | 'SEVERE'
  | 'CRITICAL';

export type ReceivableSortBy = 'standing' | 'outstanding' | 'overdue' | 'name' | 'lastPayment';
export type ReceivableSortOrder = 'asc' | 'desc';

export interface ReceivableFilters {
  search?: string;
  /** YYYY-MM. Scopes amounts to obligations due and payments made in that month. */
  month?: string;
  tier?: ReceivableTier[];
  onlyWithBalance?: boolean;
  includeInactive?: boolean;
  page?: number;
  limit?: number;
  sortBy?: ReceivableSortBy;
  sortOrder?: ReceivableSortOrder;
}

export interface ReceivableCustomer {
  id: string;
  name: string;
  phone: string;
  isActive: boolean;
}

export interface ReceivableItem {
  customer: ReceivableCustomer;
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

export interface ReceivablesSummary {
  customerCount: number;
  customersWithBalance: number;
  customersOverdue: number;
  atRiskCount: number;
  totalOutstanding: string;
  totalOverdue: string;
}

export type ReceivableTierCounts = Record<ReceivableTier, number>;

export interface ReceivablesResponseData {
  businessDate: string;
  summary: ReceivablesSummary;
  tierCounts: ReceivableTierCounts;
  items: ReceivableItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface ReceivablesResponse {
  success: boolean;
  data: ReceivablesResponseData;
  meta?: {
    timestamp?: string;
  };
}
