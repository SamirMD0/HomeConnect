import {
  DebtStatus,
  FinancialItemType,
  InstallmentPlanStatus,
  InstallmentStatus,
  PaymentAllocationTargetType,
  PaymentMethod,
} from '../types/customer-financial.types';

type BadgeTone = 'slate' | 'emerald' | 'amber' | 'red' | 'blue';

export interface StatusBadgeConfig {
  label: string;
  tone: BadgeTone;
}

export const debtStatusLabels: Record<DebtStatus, StatusBadgeConfig> = {
  UNPAID: { label: 'Unpaid', tone: 'slate' },
  PARTIALLY_PAID: { label: 'Partially paid', tone: 'blue' },
  OVERDUE: { label: 'Overdue', tone: 'red' },
  PAID: { label: 'Paid', tone: 'emerald' },
  CANCELLED: { label: 'Cancelled', tone: 'slate' },
};

export const installmentStatusLabels: Record<InstallmentStatus, StatusBadgeConfig> = {
  PENDING: { label: 'Pending', tone: 'slate' },
  PARTIALLY_PAID: { label: 'Partially paid', tone: 'blue' },
  OVERDUE: { label: 'Overdue', tone: 'red' },
  PAID: { label: 'Paid', tone: 'emerald' },
  CANCELLED: { label: 'Cancelled', tone: 'slate' },
};

export const planStatusLabels: Record<InstallmentPlanStatus, StatusBadgeConfig> = {
  ACTIVE: { label: 'Active', tone: 'blue' },
  OVERDUE: { label: 'Overdue', tone: 'red' },
  COMPLETED: { label: 'Completed', tone: 'emerald' },
  CANCELLED: { label: 'Cancelled', tone: 'slate' },
};

export const paymentMethodLabels: Record<PaymentMethod, string> = {
  CASH: 'Cash',
  CARD: 'Card',
  BANK_TRANSFER: 'Bank transfer',
  CHECK: 'Check',
  OTHER: 'Other',
};

export const itemTypeLabels: Record<FinancialItemType, string> = {
  DEBT: 'Single debt',
  INSTALLMENT: 'Installment',
};

export const allocationTargetLabels: Record<PaymentAllocationTargetType, string> = {
  DEBT: 'Single debt',
  INSTALLMENT: 'Installment',
  UNKNOWN: 'Unknown',
};

export function getBadgeToneClass(tone: BadgeTone): string {
  const classes: Record<BadgeTone, string> = {
    slate: 'bg-slate-100 text-slate-700 ring-slate-600/10',
    emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
    amber: 'bg-amber-50 text-amber-800 ring-amber-600/20',
    red: 'bg-red-50 text-red-700 ring-red-600/10',
    blue: 'bg-blue-50 text-blue-700 ring-blue-600/20',
  };
  return classes[tone];
}
