import React from 'react';
import { PrepaidPurchase } from '../types/prepaid.types';
import { PrepaidStatusBadge } from './PrepaidStatusBadge';
import { PrepaidMobileCard } from './PrepaidMobileCard';
import { PrepaidRowActions } from './PrepaidRowActions';
import { formatBusinessDate, formatMoney } from '../../customer-financial/utils/financial-format';
import { businessLabels } from '../../../shared/labels/business-labels';

interface PrepaidTableProps {
  items: PrepaidPurchase[];
  canMutate: boolean;
  openMenuKey: string | null;
  onOpenMenuChange: (key: string | null) => void;
  onDeliver: (item: PrepaidPurchase) => void;
  onRevertDelivery: (item: PrepaidPurchase) => void;
  onViewDetails: (item: PrepaidPurchase) => void;
}

/** Negative while we hold the customer's money; muted zero once delivered. */
export const PrepaidAmountOwed: React.FC<{ value: string }> = ({ value }) => {
  const isZero = Number(value) === 0;
  return (
    <span className={`tabular-nums font-semibold ${isZero ? 'text-slate-400' : 'text-red-600'}`}>
      {formatMoney(value)}
    </span>
  );
};

export const PrepaidTable: React.FC<PrepaidTableProps> = ({
  items,
  canMutate,
  openMenuKey,
  onOpenMenuChange,
  onDeliver,
  onRevertDelivery,
  onViewDetails,
}) => (
  <>
    <div className="space-y-3 md:hidden">
      {items.map((item) => (
        <PrepaidMobileCard
          key={item.id}
          item={item}
          canMutate={canMutate}
          openMenuKey={openMenuKey}
          onOpenMenuChange={onOpenMenuChange}
          onDeliver={onDeliver}
          onRevertDelivery={onRevertDelivery}
          onViewDetails={onViewDetails}
        />
      ))}
    </div>

    <div className="hidden rounded-lg border border-slate-200 bg-white shadow-sm md:block">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <caption className="sr-only">{businessLabels.prepaid.title}</caption>
          <thead className="sticky top-0 bg-slate-50">
            <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <th scope="col" className="px-4 py-3">{businessLabels.common.customer}</th>
              <th scope="col" className="px-4 py-3">{businessLabels.prepaid.item}</th>
              <th scope="col" className="hidden px-4 py-3 text-right xl:table-cell">
                {businessLabels.prepaid.fullPrice}
              </th>
              <th scope="col" className="px-4 py-3 text-right">{businessLabels.prepaid.paid}</th>
              <th scope="col" className="px-4 py-3 text-right">{businessLabels.prepaid.adminDebt}</th>
              <th scope="col" className="px-4 py-3 text-right">{businessLabels.prepaid.remaining}</th>
              <th scope="col" className="px-4 py-3">{businessLabels.prepaid.status}</th>
              <th scope="col" className="hidden px-4 py-3 lg:table-cell">
                {businessLabels.common.created}
              </th>
              <th scope="col" className="px-4 py-3 text-right">
                <span className="sr-only">{businessLabels.common.actions}</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map((item) => (
              <tr key={item.id} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <p className="user-text font-semibold text-slate-900" dir="auto">
                    {item.customer.name}
                  </p>
                  <p className="user-text text-xs text-slate-500" dir="auto">
                    {item.customer.phone}
                  </p>
                </td>
                <td className="px-4 py-3">
                  <p className="user-text text-slate-700" dir="auto">{item.itemName}</p>
                </td>
                <td className="hidden px-4 py-3 text-right tabular-nums text-slate-600 xl:table-cell">
                  {formatMoney(item.fullAmount)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                  {formatMoney(item.amountPaid)}
                </td>
                <td className="px-4 py-3 text-right">
                  <PrepaidAmountOwed value={item.adminDebt} />
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                  {item.status === 'PENDING' ? formatMoney(item.remainingToCollect) : '—'}
                </td>
                <td className="px-4 py-3">
                  <PrepaidStatusBadge status={item.status} />
                </td>
                <td className="hidden px-4 py-3 text-slate-500 lg:table-cell">
                  {formatBusinessDate(item.createdAt.slice(0, 10))}
                </td>
                <td className="px-4 py-3 text-right">
                  <PrepaidRowActions
                    item={item}
                    canMutate={canMutate}
                    menuKey={item.id}
                    openMenuKey={openMenuKey}
                    onOpenChange={onOpenMenuChange}
                    onDeliver={onDeliver}
                    onRevertDelivery={onRevertDelivery}
                    onViewDetails={onViewDetails}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  </>
);
