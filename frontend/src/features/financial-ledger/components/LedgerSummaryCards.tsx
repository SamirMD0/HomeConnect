import React from 'react';
import { AlertTriangle, Banknote, CalendarClock, ReceiptText, WalletCards } from 'lucide-react';
import { FinancialLedgerSummary } from '../types/financial-ledger.types';
import { formatMoney } from '../../customer-financial/utils/financial-format';

interface LedgerSummaryCardsProps {
  summary: FinancialLedgerSummary;
}

export const LedgerSummaryCards: React.FC<LedgerSummaryCardsProps> = ({ summary }) => {
  const cards = [
    { label: 'Total Outstanding', value: formatMoney(summary.totalOutstanding), icon: WalletCards },
    { label: 'Total Paid', value: formatMoney(summary.totalPaid), icon: Banknote },
    { label: 'Active Debts', value: String(summary.activeDebtCount), icon: ReceiptText },
    { label: 'Active Plans', value: String(summary.activePlanCount), icon: CalendarClock },
    {
      label: 'Overdue Items',
      value: String(summary.overdueDebtCount + summary.overdueInstallmentCount),
      icon: AlertTriangle,
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
      {cards.map((card) => (
        <div key={card.label} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-slate-500">{card.label}</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">{card.value}</p>
            </div>
            <card.icon className="h-5 w-5 text-emerald-600" aria-hidden="true" />
          </div>
        </div>
      ))}
    </div>
  );
};
