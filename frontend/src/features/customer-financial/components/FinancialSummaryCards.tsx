import React from 'react';
import { AlertTriangle, CalendarClock, CreditCard, HandCoins, WalletCards } from 'lucide-react';
import { FinancialSummaryTotals } from '../types/customer-financial.types';
import { formatBusinessDate, formatMoney } from '../utils/financial-format';

interface FinancialSummaryCardsProps {
  summary: FinancialSummaryTotals;
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;
/** The API reports deposits as a liability (negative); the card shows the amount held. */
const absoluteMoney = (value: string) => value.replace(/^-/, '');
const isZero = (value: string | null | undefined) => !value || Number(value) === 0;

/**
 * Customer account summary in the shape ERPs use (QuickBooks, Zoho, Odoo): one
 * balance due with its breakdown, what is overdue, deposits held, and the last
 * payment. Lifetime totals sit in a quiet strip underneath.
 */
export const FinancialSummaryCards: React.FC<FinancialSummaryCardsProps> = ({ summary }) => {
  const overdueCount = summary.overdueDebtCount + summary.overdueInstallmentCount;
  const depositsHeld = absoluteMoney(summary.totalPrepaidAdminDebt);
  const hasDeposits = summary.activePrepaidCount > 0 || !isZero(depositsHeld);

  const thirdCard = hasDeposits
    ? {
        label: 'Deposits held',
        value: formatMoney(depositsHeld),
        detail: `${plural(summary.activePrepaidCount, 'deposit')} awaiting delivery`,
        icon: HandCoins,
        tone: 'text-amber-700 bg-amber-50',
      }
    : {
        label: 'Next due',
        value: summary.nextDueDate ? formatMoney(summary.nextDueAmount) : '—',
        detail: summary.nextDueDate ? formatBusinessDate(summary.nextDueDate) : 'Nothing scheduled',
        icon: CalendarClock,
        tone: 'text-amber-700 bg-amber-50',
      };

  const cards = [
    {
      label: 'Balance due',
      value: formatMoney(summary.totalOutstanding),
      detail: `Invoices ${formatMoney(summary.singleDebtOutstanding)} · Payment plans ${formatMoney(summary.installmentPlanOutstanding)}`,
      icon: WalletCards,
      tone: isZero(summary.totalOutstanding) ? 'text-slate-600 bg-slate-50' : 'text-red-600 bg-red-50',
    },
    {
      label: 'Overdue',
      value: formatMoney(summary.overdueAmount ?? '0'),
      detail: overdueCount > 0 ? `${plural(overdueCount, 'item')} past due date` : 'Nothing overdue',
      icon: AlertTriangle,
      tone: overdueCount > 0 ? 'text-red-600 bg-red-50' : 'text-slate-600 bg-slate-50',
    },
    thirdCard,
    {
      label: 'Last payment',
      value: summary.lastPaymentDate ? formatBusinessDate(summary.lastPaymentDate) : '—',
      detail: summary.daysSinceLastPayment == null ? 'No payments yet' : `${summary.daysSinceLastPayment} days ago`,
      icon: CreditCard,
      tone: 'text-brand-600 bg-brand-50',
    },
  ];

  const lifetime = [
    { label: 'Total invoiced', value: formatMoney(summary.totalObligated ?? '0') },
    { label: 'Payments received', value: formatMoney(summary.totalPaid) },
    ...(hasDeposits
      ? [{
          label: 'Next due',
          value: summary.nextDueDate
            ? `${formatMoney(summary.nextDueAmount)} on ${formatBusinessDate(summary.nextDueDate)}`
            : 'Nothing scheduled',
        }]
      : []),
    { label: 'Open', value: `${plural(summary.activeDebtCount, 'invoice')} · ${plural(summary.activePlanCount, 'payment plan')}` },
  ];

  return (
    <section aria-labelledby="financial-summary-heading" className="space-y-3">
      <h2 id="financial-summary-heading" className="sr-only">
        Account summary
      </h2>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-500">{card.label}</p>
                  <p className="mt-2 text-2xl font-bold text-slate-900">{card.value}</p>
                  <p className="mt-1 text-sm text-slate-500">{card.detail}</p>
                </div>
                <div className={`shrink-0 rounded-lg p-3 ${card.tone}`}>
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <dl className="flex flex-wrap gap-x-8 gap-y-2 rounded-lg border border-slate-200 bg-slate-50 px-5 py-3 text-sm">
        {lifetime.map((item) => (
          <div key={item.label} className="flex gap-2">
            <dt className="text-slate-500">{item.label}</dt>
            <dd className="font-semibold text-slate-900">{item.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
};
