import { businessLabels } from '../../../shared/labels/business-labels';
import { PrepaidStatus } from '../types/prepaid.types';

export const prepaidStatusLabels: Record<PrepaidStatus, string> = {
  PENDING: businessLabels.prepaid.statusPending,
  DELIVERED: businessLabels.prepaid.statusDelivered,
  CANCELLED: businessLabels.prepaid.statusCancelled,
};

export const prepaidStatusTone: Record<PrepaidStatus, string> = {
  PENDING: 'bg-amber-50 text-amber-700 ring-amber-200',
  DELIVERED: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  CANCELLED: 'bg-slate-100 text-slate-600 ring-slate-200',
};
