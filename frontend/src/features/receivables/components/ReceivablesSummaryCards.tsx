import React from 'react';
import { AlertTriangle, ShieldAlert, Users, WalletCards } from 'lucide-react';
import { formatMoney } from '../../customer-financial/utils/financial-format';
import { ReceivablesSummary } from '../types/receivables.types';

interface ReceivablesSummaryCardsProps {
  summary: ReceivablesSummary;
}

export const ReceivablesSummaryCards: React.FC<ReceivablesSummaryCardsProps> = ({ summary }) => {
  const cards = [
    {
      label: 'Total Outstanding',
      value: formatMoney(summary.totalOutstanding),
      icon: WalletCards,
      tone: 'text-emerald-600',
    },
    {
      label: 'Total Overdue',
      value: formatMoney(summary.totalOverdue),
      icon: AlertTriangle,
      tone: 'text-red-600',
    },
    {
      label: 'Customers Owing',
      value: `${summary.customersWithBalance} / ${summary.customerCount}`,
      icon: Users,
      tone: 'text-slate-500',
    },
    {
      label: 'At Risk',
      value: String(summary.atRiskCount),
      icon: ShieldAlert,
      tone: 'text-red-900',
      caption: `${summary.customersOverdue} customer${summary.customersOverdue === 1 ? '' : 's'} overdue`,
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => (
        <div key={card.label} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-slate-500">{card.label}</p>
              <p className="mt-2 text-2xl font-semibold tabular-nums text-slate-900">{card.value}</p>
              <p className="mt-1 text-xs text-slate-400">{card.caption ?? 'For current filters'}</p>
            </div>
            <card.icon className={`h-5 w-5 shrink-0 ${card.tone}`} aria-hidden="true" />
          </div>
        </div>
      ))}
    </div>
  );
};
