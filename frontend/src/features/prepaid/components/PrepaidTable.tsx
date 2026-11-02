import React from 'react';
import { PrepaidPurchase } from '../types/prepaid.types';
import { PrepaidStatusBadge } from './PrepaidStatusBadge';
import { PrepaidMobileCard } from './PrepaidMobileCard';
import { PrepaidRowActions } from './PrepaidRowActions';
import { formatBusinessDate, formatMoney } from '../../customer-financial/utils/financial-format';
import { BranchRowLabel } from '../../branches/scope/branch-ui';

interface PrepaidTableProps {
  items: PrepaidPurchase[];
  canMutate: boolean;
  openMenuKey: string | null;
  onOpenMenuChange: (key: string | null) => void;
  onDeliver: (item: PrepaidPurchase) => void;
  onConvert?: (item: PrepaidPurchase) => void;
  onRevertDelivery: (item: PrepaidPurchase) => void;
  onViewDetails: (item: PrepaidPurchase) => void;
  onEdit: (item: PrepaidPurchase) => void;
  onRecordPayment: (item: PrepaidPurchase) => void;
  onCancel: (item: PrepaidPurchase) => void;
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
  onConvert,
  onRevertDelivery,
  onViewDetails,
  onEdit,
  onRecordPayment,
  onCancel,
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
          onConvert={onConvert}
          onRevertDelivery={onRevertDelivery}
          onViewDetails={onViewDetails}
          onEdit={onEdit}
          onRecordPayment={onRecordPayment}
          onCancel={onCancel}
        />
      ))}
    </div>

    <div className="hidden rounded-lg border border-slate-200 bg-white shadow-sm md:block">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <caption className="sr-only">Prepaid purchases</caption>
          <thead className="sticky top-0 bg-slate-100 font-semibold">
            <tr className="text-left text-xs font-semibold text-slate-700">
              <th scope="col" className="px-4 py-3">Customer</th>
              <th scope="col" className="min-w-44 px-4 py-3">Item</th>
              <th scope="col" className="hidden px-4 py-3 text-right xl:table-cell">
                Full price
              </th>
              <th scope="col" className="px-4 py-3 text-right">Paid</th>
              <th scope="col" className="px-4 py-3 text-right">We owe</th>
              <th scope="col" className="px-4 py-3 text-right">Remaining</th>
              <th scope="col" className="px-4 py-3">Status</th>
              <th scope="col" className="hidden px-4 py-3 lg:table-cell">
                Created
              </th>
              <th scope="col" className="w-14 px-4 py-3">
                <span className="sr-only">Actions</span>
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
                  <BranchRowLabel branchId={item.branchId} />
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
                    onConvert={onConvert}
                    onRevertDelivery={onRevertDelivery}
                    onViewDetails={onViewDetails}
                    onEdit={onEdit}
                    onRecordPayment={onRecordPayment}
                    onCancel={onCancel}
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
