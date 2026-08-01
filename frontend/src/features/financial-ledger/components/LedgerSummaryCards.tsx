import React from 'react';
import { AlertTriangle, Banknote, CalendarClock, ReceiptText, Users, WalletCards } from 'lucide-react';
import { FinancialLedgerSummary } from '../types/financial-ledger.types';
import { formatMoney } from '../../customer-financial/utils/financial-format';

interface LedgerSummaryCardsProps {
  summary: FinancialLedgerSummary;
}

export const LedgerSummaryCards: React.FC<LedgerSummaryCardsProps> = ({ summary }) => {
  const cards = [
    { label: 'Outstanding', value: formatMoney(summary.totalOutstanding), icon: WalletCards },
    { label: 'Paid', value: formatMoney(summary.totalPaid), icon: Banknote },
    { label: 'Debts', value: String(summary.activeDebtCount), icon: ReceiptText },
    { label: 'Plans', value: String(summary.activePlanCount), icon: CalendarClock },
    { label: 'Customers', value: String(summary.activeCustomerCount), icon: Users },
    {
      label: 'Overdue',
      value: String(summary.overdueDebtCount + summary.overdueInstallmentCount),
      icon: AlertTriangle,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4 2xl:grid-cols-8">
      {cards.map((card) => (
        <div key={card.label} className="rounded-lg border border-slate-200 bg-white px-3 py-3 shadow-sm">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold uppercase tracking-wide text-slate-500">{card.label}</p>
              <p className="mt-1 text-xl font-semibold leading-tight text-slate-900">{card.value}</p>
              {summary.basis === 'filtered' && (
                <p className="mt-1 text-[11px] leading-tight text-slate-400">Current filters</p>
              )}
            </div>
            <card.icon className="mt-1 h-4 w-4 flex-shrink-0 text-emerald-600" aria-hidden="true" />
          </div>
        </div>
      ))}
    </div>
  );
};
