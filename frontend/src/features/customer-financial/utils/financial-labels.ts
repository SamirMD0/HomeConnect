import {
  DebtStatus,
  FinancialItemType,
  InstallmentPlanStatus,
  InstallmentStatus,
  PaymentAllocationTargetType,
  PaymentMethod,
} from '../types/customer-financial.types';
import { businessLabels } from '../../../shared/labels/business-labels';

type BadgeTone = 'slate' | 'emerald' | 'amber' | 'red' | 'blue';

export interface StatusBadgeConfig {
  label: string;
  tone: BadgeTone;
}

export const debtStatusLabels: Record<DebtStatus, StatusBadgeConfig> = {
  UNPAID: { label: 'Unpaid / غير مدفوع', tone: 'slate' },
  PARTIALLY_PAID: { label: 'Partially paid / مدفوع جزئياً', tone: 'blue' },
  OVERDUE: { label: 'Overdue / متأخر', tone: 'red' },
  PAID: { label: 'Paid / مدفوع', tone: 'emerald' },
  CANCELLED: { label: 'Cancelled / ملغى', tone: 'slate' },
};

export const installmentStatusLabels: Record<InstallmentStatus, StatusBadgeConfig> = {
  PENDING: { label: 'Pending / قيد الانتظار', tone: 'slate' },
  PARTIALLY_PAID: { label: 'Partially paid / مدفوع جزئياً', tone: 'blue' },
  OVERDUE: { label: 'Overdue / متأخر', tone: 'red' },
  PAID: { label: 'Paid / مدفوع', tone: 'emerald' },
  CANCELLED: { label: 'Cancelled / ملغى', tone: 'slate' },
};

export const planStatusLabels: Record<InstallmentPlanStatus, StatusBadgeConfig> = {
  ACTIVE: { label: 'Active / نشط', tone: 'blue' },
  OVERDUE: { label: 'Overdue / متأخر', tone: 'red' },
  COMPLETED: { label: 'Completed / مكتمل', tone: 'emerald' },
  CANCELLED: { label: 'Cancelled / ملغى', tone: 'slate' },
};

export const paymentMethodLabels: Record<PaymentMethod, string> = {
  CASH: 'Cash / نقداً',
  CARD: 'Card / بطاقة',
  BANK_TRANSFER: 'Bank transfer / تحويل مصرفي',
  CHECK: 'Check / شيك',
  OTHER: 'Other / أخرى',
};

export const itemTypeLabels: Record<FinancialItemType, string> = {
  DEBT: businessLabels.financial.singleDebt,
  INSTALLMENT: businessLabels.financial.installment,
};

export const allocationTargetLabels: Record<PaymentAllocationTargetType, string> = {
  DEBT: businessLabels.financial.singleDebt,
  INSTALLMENT: businessLabels.financial.installment,
  UNKNOWN: 'Unknown / غير معروف',
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
