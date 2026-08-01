import React from 'react';
import { CreditCard, HandCoins, Landmark, ReceiptText } from 'lucide-react';
import { businessLabels } from '../../../shared/labels/business-labels';
import { formatMoney } from '../../customer-financial/utils/financial-format';
import { SupplierSummary } from '../types/supplier.types';

export const SupplierSummaryCards: React.FC<{ summary: SupplierSummary }> = ({ summary }) => {
  const cards = [
    { label: businessLabels.supplier.totalOwed, value: summary.totalOwed, icon: ReceiptText },
    { label: businessLabels.supplier.totalPaid, value: summary.totalPaid, icon: CreditCard },
    { label: businessLabels.supplier.totalCredit, value: summary.totalCredit, icon: HandCoins },
    { label: businessLabels.supplier.balance, value: summary.balance, icon: Landmark },
  ];

  return <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{cards.map((card) => <div key={card.label} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
    <div className="flex justify-between gap-2"><div><p className="text-xs font-semibold text-slate-500">{card.label}</p><p className={`mt-2 text-xl font-bold tabular-nums ${card.label === businessLabels.supplier.balance && card.value.startsWith('-') ? 'text-red-700' : 'text-slate-900'}`}>{formatMoney(card.value)}</p><p className="mt-1 text-[11px] text-slate-400">{summary.basis === 'filtered' ? 'Current filters / الفلاتر الحالية' : 'Lifetime / كامل المدة'}</p></div><card.icon className="h-4 w-4 text-emerald-600" /></div>
  </div>)}</div>;
};
