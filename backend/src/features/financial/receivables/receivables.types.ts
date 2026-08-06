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

/**
 * The financial slice of one customer, for list-style screens that show money
 * next to a name.
 *
 * Deliberately a subset of `ReceivableItemView` rather than a parallel shape:
 * the customers list and the receivables page must never disagree about what a
 * customer owes, so both are produced by the same computation. Add fields here
 * by widening the projection, never by computing a second answer.
 */
export interface ReceivableCustomerProjection {
  customerId: string;
  tier: ReceivableTier;
  tierReason: string;
  totalObligated: string;
  totalPaid: string;
  outstanding: string;
  overdueAmount: string;
  openDebtCount: number;
  activePlanCount: number;
  overdueItemCount: number;
  maxOverdueDays: number;
  nextDueDate: string | null;
  lastPaymentDate: string | null;
  daysSinceLastPayment: number | null;
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
