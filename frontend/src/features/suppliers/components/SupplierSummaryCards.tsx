import React from 'react';
import { CreditCard, HandCoins, Landmark, ReceiptText } from 'lucide-react';
import { formatMoney } from '../../customer-financial/utils/financial-format';
import { SupplierSummary } from '../types/supplier.types';

/**
 * Accounts-payable summary in ERP terms (QuickBooks, Zoho, Odoo): what we still
 * owe first, then what was billed, paid and credited.
 */
export const SupplierSummaryCards: React.FC<{ summary: SupplierSummary }> = ({ summary }) => {
  const inOurFavour = summary.balance.startsWith('-');
  const basis = summary.basis === 'filtered' ? 'Current filters' : 'Lifetime';
  const cards = [
    {
      label: inOurFavour ? 'Credit in our favour' : 'Balance payable',
      value: summary.balance.replace(/^-/, ''),
      detail: inOurFavour ? 'The supplier owes us this amount' : 'What we still owe this supplier',
      icon: Landmark,
      strong: true,
    },
    { label: 'Total billed', value: summary.totalOwed, detail: basis, icon: ReceiptText, strong: false },
    { label: 'Payments made', value: summary.totalPaid, detail: basis, icon: CreditCard, strong: false },
    { label: 'Credits received', value: summary.totalCredit, detail: basis, icon: HandCoins, strong: false },
  ];

  return <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{cards.map((card) => <div key={card.label} className={`rounded-lg border bg-white p-4 shadow-sm ${card.strong ? 'border-brand-200' : 'border-slate-200'}`}>
    <div className="flex justify-between gap-2"><div className="min-w-0"><p className="text-xs font-semibold text-slate-500">{card.label}</p><p className={`mt-2 font-bold tabular-nums ${card.strong ? 'text-2xl' : 'text-xl'} ${card.strong && !inOurFavour && Number(card.value) > 0 ? 'text-red-700' : 'text-slate-900'}`}>{formatMoney(card.value)}</p><p className="mt-1 text-[11px] text-slate-500">{card.detail}</p></div><card.icon className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" /></div>
  </div>)}</div>;
};
