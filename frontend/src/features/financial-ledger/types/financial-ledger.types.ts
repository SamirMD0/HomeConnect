import {
  DebtStatus,
  InstallmentPlanStatus,
  InstallmentStatus,
  PaymentMethod,
} from '../../customer-financial/types/customer-financial.types';

export type FinancialLedgerTypeFilter = 'ALL' | 'DEBT' | 'INSTALLMENT_PLAN' | 'PAYMENT' | 'OVERDUE';
export type FinancialLedgerStatusFilter = 'ACTIVE' | 'OVERDUE' | 'PAID_COMPLETED' | 'CANCELLED';
export type FinancialLedgerSortBy = 'date' | 'createdAt' | 'customer' | 'amount';
export type FinancialLedgerSortOrder = 'asc' | 'desc';

export interface FinancialLedgerFilters {
  type?: FinancialLedgerTypeFilter;
  status?: FinancialLedgerStatusFilter;
  customerId?: string;
  search?: string;
  dueFrom?: string;
  dueTo?: string;
  paymentFrom?: string;
  paymentTo?: string;
  includeCancelled?: boolean;
  page?: number;
  limit?: number;
  sortBy?: FinancialLedgerSortBy;
  sortOrder?: FinancialLedgerSortOrder;
}

export interface FinancialLedgerCustomer {
  id: string;
  name: string;
  phone: string;
}

export interface FinancialLedgerSummary {
  totalOutstanding: string;
  totalPaid: string;
  activeDebtCount: number;
  activePlanCount: number;
  overdueDebtCount: number;
  overdueInstallmentCount: number;
}

export interface FinancialLedgerDebtItem {
  type: 'DEBT';
  id: string;
  customer: FinancialLedgerCustomer;
  description: string;
  originalAmount: string;
  totalPaid: string;
  remainingBalance: string;
  dueDate: string;
  status: DebtStatus;
  storedStatus: DebtStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  cancellation: {
    cancelledAt: string;
    reason: string | null;
  } | null;
}

export interface FinancialLedgerPlanItem {
  type: 'INSTALLMENT_PLAN';
  id: string;
  customer: FinancialLedgerCustomer;
  description: string;
  totalAmount: string;
  totalPaid: string;
  remainingBalance: string;
  startDate: string;
  installmentCount: number;
  frequency: 'MONTHLY';
  completedInstallmentCount: number;
  overdueInstallmentCount: number;
  nextDueDate: string | null;
  status: InstallmentPlanStatus;
  storedStatus: InstallmentPlanStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  cancellation: {
    cancelledAt: string;
    reason: string | null;
  } | null;
  scheduleSummary: {
    totalInstallments: number;
    completedInstallments: number;
    remainingInstallments: number;
    nextInstallment: {
      id: string;
      installmentNumber: number;
      dueDate: string;
      remainingAmount: string;
      status: InstallmentStatus;
    } | null;
  };
}

export interface FinancialLedgerPaymentItem {
  type: 'PAYMENT';
  id: string;
  customer: FinancialLedgerCustomer;
  amount: string;
  paymentDate: string;
  paymentMethod: PaymentMethod;
  status: 'COMPLETED' | 'VOIDED';
  reference: string | null;
  notes: string | null;
  idempotencyKey: string | null;
  createdAt: string;
  voidedAt: string | null;
  allocations: Array<{
    id: string;
    targetType: 'DEBT' | 'INSTALLMENT' | 'UNKNOWN';
    debtId: string | null;
    installmentId: string | null;
    planId: string | null;
    description: string | null;
    amount: string;
    createdAt: string;
  }>;
}

export type FinancialLedgerItem =
  | FinancialLedgerDebtItem
  | FinancialLedgerPlanItem
  | FinancialLedgerPaymentItem;

export interface FinancialLedgerResponseData {
  summary: FinancialLedgerSummary;
  items: FinancialLedgerItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface FinancialLedgerResponse {
  success: boolean;
  data: FinancialLedgerResponseData;
  meta?: {
    timestamp?: string;
  };
}
