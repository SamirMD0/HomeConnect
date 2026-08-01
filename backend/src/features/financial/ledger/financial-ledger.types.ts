import {
  DebtKind,
  DebtStatus,
  InstallmentPlanFrequency,
  InstallmentPlanStatus,
  InstallmentStatus,
  PaymentMethod,
} from '@prisma/client';

export type FinancialLedgerTypeFilter =
  | 'ALL'
  | 'DEBT'
  | 'INSTALLMENT_PLAN'
  | 'PAYMENT'
  | 'OVERDUE';
export type FinancialLedgerStatusFilter = 'ACTIVE' | 'OVERDUE' | 'PAID_COMPLETED' | 'CANCELLED';
export type FinancialLedgerSortBy = 'date' | 'createdAt' | 'customer' | 'amount';
export type FinancialLedgerSortOrder = 'asc' | 'desc';

export interface FinancialLedgerCustomerView {
  id: string;
  name: string;
  phone: string;
}

export interface FinancialLedgerSummaryView {
  basis: 'filtered';
  totalOutstanding: string;
  totalPaid: string;
  activeDebtCount: number;
  activePlanCount: number;
  activeCustomerCount: number;
  overdueDebtCount: number;
  overdueInstallmentCount: number;
}

export interface FinancialLedgerCorrectionView {
  hasCorrections: boolean;
  correctionCount: number;
  lastCorrectedAt: string | null;
}

export interface FinancialLedgerDebtItem {
  type: 'DEBT';
  kind: DebtKind;
  id: string;
  customer: FinancialLedgerCustomerView;
  description: string;
  originalAmount: string;
  totalPaid: string;
  remainingBalance: string;
  adminDebt: string;
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
  correction: FinancialLedgerCorrectionView;
}

export interface FinancialLedgerPlanItem {
  type: 'INSTALLMENT_PLAN';
  id: string;
  customer: FinancialLedgerCustomerView;
  description: string;
  totalAmount: string;
  totalPaid: string;
  remainingBalance: string;
  startDate: string;
  installmentCount: number;
  frequency: InstallmentPlanFrequency;
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
  periodSummary: {
    dueFrom: string | null;
    dueTo: string | null;
    installmentCount: number;
    totalDue: string;
    totalPaid: string;
    totalRemaining: string;
  } | null;
  correction: FinancialLedgerCorrectionView;
}

export interface FinancialLedgerPaymentItem {
  type: 'PAYMENT';
  id: string;
  customer: FinancialLedgerCustomerView;
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
  correction: FinancialLedgerCorrectionView;
}

export type FinancialLedgerItem =
  | FinancialLedgerDebtItem
  | FinancialLedgerPlanItem
  | FinancialLedgerPaymentItem;

export interface FinancialLedgerView {
  summary: FinancialLedgerSummaryView;
  items: FinancialLedgerItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
