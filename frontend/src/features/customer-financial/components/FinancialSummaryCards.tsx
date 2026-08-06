import React from 'react';
import { AlertTriangle, CalendarClock, CreditCard, HandCoins, Landmark, ReceiptText, WalletCards } from 'lucide-react';
import { FinancialSummaryTotals } from '../types/customer-financial.types';
import { formatBusinessDate, formatMoney } from '../utils/financial-format';

interface FinancialSummaryCardsProps {
  summary: FinancialSummaryTotals;
}

export const FinancialSummaryCards: React.FC<FinancialSummaryCardsProps> = ({ summary }) => {
  const overdueTotal = summary.overdueDebtCount + summary.overdueInstallmentCount;
  const cards = [
    {
      label: 'Total Outstanding',
      value: formatMoney(summary.totalOutstanding),
      detail: 'Customer debts and installment plans',
      icon: WalletCards,
      tone: 'text-red-600 bg-red-50',
    },
    {
      label: 'Single Debts',
      value: formatMoney(summary.singleDebtOutstanding),
      detail: `${summary.activeDebtCount} active debt${summary.activeDebtCount === 1 ? '' : 's'}`,
      icon: ReceiptText,
      tone: 'text-blue-600 bg-blue-50',
    },
    {
      label: 'Installment Plans',
      value: formatMoney(summary.installmentPlanOutstanding),
      detail: `${summary.activePlanCount} active plan${summary.activePlanCount === 1 ? '' : 's'}`,
      icon: Landmark,
      tone: 'text-indigo-600 bg-indigo-50',
    },
    {
      label: 'Admin Pre-paid Debt / دين مسبق على الإدارة',
      value: formatMoney(summary.totalPrepaidAdminDebt),
      detail: `${summary.activePrepaidCount} active pre-paid purchase${summary.activePrepaidCount === 1 ? '' : 's'}`,
      icon: HandCoins,
      tone: 'text-red-700 bg-red-50',
    },
    {
      label: 'Total Paid',
      value: formatMoney(summary.totalPaid),
      detail: 'Valid non-voided payments',
      icon: CreditCard,
      tone: 'text-emerald-600 bg-emerald-50',
    },
    {
      label: 'Total Debt Created / إجمالي الديون',
      value: formatMoney(summary.totalObligated ?? '0'),
      detail: 'Lifetime obligations',
      icon: ReceiptText,
      tone: 'text-slate-700 bg-slate-50',
    },
    {
      label: 'Overdue / متأخر',
      value: formatMoney(summary.overdueAmount ?? '0'),
      detail: `${summary.overdueDebtCount} debts, ${summary.overdueInstallmentCount} installments`,
      icon: AlertTriangle,
      tone: overdueTotal > 0 ? 'text-red-600 bg-red-50' : 'text-slate-600 bg-slate-50',
    },
    {
      label: 'Next Due',
      value: formatMoney(summary.nextDueAmount),
      detail: summary.nextDueDate ? formatBusinessDate(summary.nextDueDate) : 'No outstanding payments',
      icon: CalendarClock,
      tone: 'text-amber-700 bg-amber-50',
    },
    {
      label: 'Last Payment / آخر دفعة',
      value: summary.lastPaymentDate ? formatBusinessDate(summary.lastPaymentDate) : '—',
      detail: summary.daysSinceLastPayment == null ? 'No payments' : `${summary.daysSinceLastPayment} days ago`,
      icon: CreditCard,
      tone: 'text-emerald-600 bg-emerald-50',
    },
  ];

  return (
    <section aria-labelledby="financial-summary-heading">
      <h2 id="financial-summary-heading" className="sr-only">
        Financial summary
      </h2>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-slate-500">{card.label}</p>
                  <p className="mt-2 text-2xl font-bold text-slate-900">{card.value}</p>
                  <p className="mt-1 text-sm text-slate-500">{card.detail}</p>
                </div>
                <div className={`rounded-lg p-3 ${card.tone}`}>
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};
