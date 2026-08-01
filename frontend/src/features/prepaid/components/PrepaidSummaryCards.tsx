import React from 'react';
import { HandCoins, PackageCheck, Users, WalletCards } from 'lucide-react';
import { PrepaidSummary } from '../types/prepaid.types';
import { formatMoney } from '../../customer-financial/utils/financial-format';
import { businessLabels } from '../../../shared/labels/business-labels';

interface PrepaidSummaryCardsProps {
  summary: PrepaidSummary;
}

/**
 * Values come straight from the API. Never recompute money from the page rows:
 * page 2 would disagree with page 1.
 */
export const PrepaidSummaryCards: React.FC<PrepaidSummaryCardsProps> = ({ summary }) => {
  const cards = [
    {
      label: businessLabels.prepaid.totalWeOwe,
      value: formatMoney(summary.totalAdminDebt),
      icon: HandCoins,
      emphasis: true,
    },
    {
      label: businessLabels.prepaid.awaitingDelivery,
      value: String(summary.pendingCount),
      icon: PackageCheck,
    },
    {
      label: businessLabels.prepaid.remaining,
      value: formatMoney(summary.totalRemainingToCollect),
      icon: WalletCards,
    },
    {
      label: businessLabels.common.customer,
      value: String(summary.customerCount),
      icon: Users,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {cards.map((card) => (
        <div
          key={card.label}
          className="rounded-lg border border-slate-200 bg-white px-3 py-3 shadow-sm"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold uppercase tracking-wide text-slate-500">
                {card.label}
              </p>
              <p
                className={`mt-1 text-xl font-semibold leading-tight tabular-nums ${
                  card.emphasis ? 'text-red-600' : 'text-slate-900'
                }`}
              >
                {card.value}
              </p>
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
