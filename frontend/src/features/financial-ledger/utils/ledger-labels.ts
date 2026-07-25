import {
  FinancialLedgerStatusFilter,
  FinancialLedgerTypeFilter,
} from '../types/financial-ledger.types';

export const ledgerTypeLabels: Record<FinancialLedgerTypeFilter, string> = {
  ALL: 'All',
  DEBT: 'Debts',
  INSTALLMENT_PLAN: 'Installment Plans',
  PAYMENT: 'Payments',
  OVERDUE: 'Overdue',
};

export const ledgerStatusLabels: Record<FinancialLedgerStatusFilter, string> = {
  ACTIVE: 'Active',
  OVERDUE: 'Overdue',
  PAID_COMPLETED: 'Paid / Completed',
  CANCELLED: 'Cancelled',
};
