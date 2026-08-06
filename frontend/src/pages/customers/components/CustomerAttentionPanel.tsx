import React from 'react';
import { CustomerFinancialSummary } from '../../../features/customer-financial/types/customer-financial.types';

export const CustomerAttentionPanel: React.FC<{ data: CustomerFinancialSummary }> = ({ data }) => {
  const alerts = [
    data.summary.overdueDebtCount + data.summary.overdueInstallmentCount > 0 ? 'Overdue balance / رصيد متأخر' : null,
    data.overdueItems.some((item) => item.type === 'INSTALLMENT') ? 'Missed installment / قسط متأخر' : null,
    (data.summary.daysSinceLastPayment ?? 0) > 30 ? 'No recent payment / لا توجد دفعة حديثة' : null,
  ].filter((item): item is string => Boolean(item));
  if (alerts.length === 0) return null;
  return <aside className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-900"><h3 className="font-semibold">Needs attention / يحتاج متابعة</h3><ul className="mt-2 list-disc pl-5 text-sm">{alerts.slice(0, 3).map((alert) => <li key={alert}>{alert}</li>)}</ul>{alerts.length > 3 && <p className="mt-2 text-xs">+{alerts.length - 3} more</p>}</aside>;
};
