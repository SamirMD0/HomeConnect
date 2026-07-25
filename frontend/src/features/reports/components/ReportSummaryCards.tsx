import React from 'react';
import { AlertTriangle, Banknote, CalendarClock, ReceiptText, Users, WalletCards } from 'lucide-react';
import {
  MonthlyDebtReportSummary,
  MonthlyFinancialActivitySummary,
} from '../types/monthly-reports.types';
import { formatMoney } from '../../customer-financial/utils/financial-format';

export const MonthlyDebtSummaryCards: React.FC<{ summary: MonthlyDebtReportSummary }> = ({ summary }) => {
  const cards = [
    { label: 'Customers with Debt', value: String(summary.customerCount), icon: Users },
    { label: 'Total Outstanding', value: formatMoney(summary.totalOutstanding), icon: WalletCards },
    { label: 'Single Debts', value: formatMoney(summary.singleDebtOutstandingTotal), icon: ReceiptText },
    {
      label: 'Installment Plans',
      value: formatMoney(summary.installmentPlanOutstandingTotal),
      icon: CalendarClock,
    },
    { label: 'Due by Month End', value: formatMoney(summary.totalAmountDueByCutoff), icon: Banknote },
    { label: 'Overdue at Month End', value: formatMoney(summary.totalOverdueAtCutoff), icon: AlertTriangle },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-6">
      {cards.map((card) => (
        <div key={card.label} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-slate-500">{card.label}</p>
              <p className="mt-2 text-xl font-semibold text-slate-900">{card.value}</p>
            </div>
            <card.icon className="h-5 w-5 text-emerald-600" aria-hidden="true" />
          </div>
        </div>
      ))}
    </div>
  );
};

export const MonthlyActivitySummaryCards: React.FC<{ summary: MonthlyFinancialActivitySummary }> = ({
  summary,
}) => {
  const cards = [
    { label: 'New Debts', value: formatMoney(summary.newSingleDebtAmount), icon: ReceiptText },
    { label: 'New Plans', value: formatMoney(summary.newInstallmentPlanAmount), icon: CalendarClock },
    { label: 'Payments Received', value: formatMoney(summary.paymentsReceived), icon: Banknote },
    { label: 'Net Change', value: formatMoney(summary.netFinancialChange), icon: WalletCards },
    { label: 'Customers Affected', value: String(summary.customerCountAffected), icon: Users },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
      {cards.map((card) => (
        <div key={card.label} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-slate-500">{card.label}</p>
              <p className="mt-2 text-xl font-semibold text-slate-900">{card.value}</p>
            </div>
            <card.icon className="h-5 w-5 text-emerald-600" aria-hidden="true" />
          </div>
        </div>
      ))}
    </div>
  );
};
