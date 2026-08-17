import React from 'react';
import { HandCoins, PackageCheck, Receipt, WalletCards } from 'lucide-react';
import { PrepaidPurchase, PrepaidSummary } from '../types/prepaid.types';
import { PrepaidBillHistory } from './PrepaidBillHistory';
import { PrepaidStatusBadge } from './PrepaidStatusBadge';
import {
  formatBusinessDate,
  formatMoney,
} from '../../customer-financial/utils/financial-format';
import { businessLabels } from '../../../shared/labels/business-labels';

interface CustomerPrepaidHistoryProps {
  items: PrepaidPurchase[];
  /** Backend totals for this customer. Never recomputed from the rows here. */
  summary: PrepaidSummary;
  onViewDetails?: (item: PrepaidPurchase) => void;
  /** Adds another bill to an existing prepaid purchase. */
  onRecordBill?: (item: PrepaidPurchase) => void;
}

/**
 * A customer's prepaid credit: the balance the business is holding, plus every
 * prepaid purchase and every bill paid towards it. Adding a purchase appends a
 * row; it never replaces an earlier one.
 */
export const CustomerPrepaidHistory: React.FC<CustomerPrepaidHistoryProps> = ({
  items,
  summary,
  onViewDetails,
  onRecordBill,
}) => {
  const cards = [
    {
      label: businessLabels.prepaid.balance,
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
      label: businessLabels.prepaid.bills,
      value: String(items.reduce((total, item) => total + (item.paymentCount ?? 0), 0)),
      icon: Receipt,
    },
  ];

  return (
    <section aria-labelledby="customer-prepaid-heading" className="space-y-4">
      <h3 id="customer-prepaid-heading" className="text-lg font-semibold text-slate-900">
        {businessLabels.prepaid.history}
      </h3>

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
              </div>
              <card.icon className="mt-1 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
            </div>
          </div>
        ))}
      </div>

      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
          {businessLabels.prepaid.customerEmpty}
        </div>
      ) : (
        <ol className="space-y-3">
          {items.map((item) => (
            <li
              key={item.id}
              className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="user-text font-semibold text-slate-900" dir="auto">
                    {item.itemName}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {businessLabels.common.created}: {formatBusinessDate(item.createdAt.slice(0, 10))}
                    {item.createdBy && (
                      <span className="user-text" dir="auto">
                        {' · '}
                        {businessLabels.prepaid.createdBy}: {item.createdBy.name}
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <PrepaidStatusBadge status={item.status} />
                  {onRecordBill && item.status === 'PENDING' && !item.isFullyPaid && (
                    <button
                      type="button"
                      onClick={() => onRecordBill(item)}
                      className="rounded-md border border-emerald-200 px-3 py-1.5 text-sm font-medium text-emerald-700 hover:bg-emerald-50 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                    >
                      {businessLabels.prepaid.recordPayment}
                    </button>
                  )}
                  {onViewDetails && (
                    <button
                      type="button"
                      onClick={() => onViewDetails(item)}
                      className="rounded-md border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                    >
                      {businessLabels.prepaid.viewDetails}
                    </button>
                  )}
                </div>
              </div>

              <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Figure label={businessLabels.prepaid.fullPrice} value={formatMoney(item.fullAmount)} />
                <Figure label={businessLabels.prepaid.paid} value={formatMoney(item.amountPaid)} />
                <Figure
                  label={businessLabels.prepaid.adminDebt}
                  value={formatMoney(item.adminDebt)}
                  tone={Number(item.adminDebt) === 0 ? 'muted' : 'debt'}
                />
                <Figure
                  label={businessLabels.prepaid.remaining}
                  value={formatMoney(item.remainingToCollect)}
                />
              </dl>

              <div className="mt-3">
                <PrepaidBillHistory payments={item.payments ?? []} />
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
};

const Figure: React.FC<{ label: string; value: string; tone?: 'debt' | 'muted' }> = ({
  label,
  value,
  tone,
}) => (
  <div>
    <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
    <dd
      className={`mt-1 font-semibold tabular-nums ${
        tone === 'debt' ? 'text-red-600' : tone === 'muted' ? 'text-slate-400' : 'text-slate-900'
      }`}
    >
      {value}
    </dd>
  </div>
);
