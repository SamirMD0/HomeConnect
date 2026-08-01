import {
  FinancialLedgerStatusFilter,
  FinancialLedgerTypeFilter,
} from '../types/financial-ledger.types';

export const ledgerTypeLabels: Record<FinancialLedgerTypeFilter, string> = {
  ALL: 'All / الكل',
  DEBT: 'Debts / ديون',
  INSTALLMENT_PLAN: 'Installment Plans / خطط تقسيط',
  PAYMENT: 'Payments / دفعات',
  OVERDUE: 'Overdue / متأخر',
};

export const ledgerStatusLabels: Record<FinancialLedgerStatusFilter, string> = {
  ACTIVE: 'Active / نشط',
  OVERDUE: 'Overdue / متأخر',
  PAID_COMPLETED: 'Paid or Completed / مدفوع أو مكتمل',
  CANCELLED: 'Cancelled / ملغى',
};
