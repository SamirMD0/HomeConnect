import React from 'react';
import { PrepaidPurchase } from '../types/prepaid.types';
import { PrepaidStatusBadge } from './PrepaidStatusBadge';
import { PrepaidRowActions } from './PrepaidRowActions';
import { formatMoney } from '../../customer-financial/utils/financial-format';
import { businessLabels } from '../../../shared/labels/business-labels';

interface PrepaidMobileCardProps {
  item: PrepaidPurchase;
  canMutate: boolean;
  openMenuKey: string | null;
  onOpenMenuChange: (key: string | null) => void;
  onDeliver: (item: PrepaidPurchase) => void;
  onRevertDelivery: (item: PrepaidPurchase) => void;
  onViewDetails: (item: PrepaidPurchase) => void;
}

export const PrepaidMobileCard: React.FC<PrepaidMobileCardProps> = ({
  item,
  canMutate,
  openMenuKey,
  onOpenMenuChange,
  onDeliver,
  onRevertDelivery,
  onViewDetails,
}) => {
  const owesNothing = Number(item.adminDebt) === 0;

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="user-text font-semibold text-slate-900" dir="auto">
            {item.customer.name}
          </p>
          <p className="user-text line-clamp-2 text-sm text-slate-600" dir="auto">
            {item.itemName}
          </p>
        </div>
        <PrepaidRowActions
          item={item}
          canMutate={canMutate}
          menuKey={`mobile-${item.id}`}
          openMenuKey={openMenuKey}
          onOpenChange={onOpenMenuChange}
          onDeliver={onDeliver}
          onRevertDelivery={onRevertDelivery}
          onViewDetails={onViewDetails}
        />
      </div>

      <p
        className={`mt-3 text-2xl font-semibold tabular-nums ${
          owesNothing ? 'text-slate-400' : 'text-red-600'
        }`}
      >
        {formatMoney(item.adminDebt)}
      </p>
      <p className="text-xs uppercase tracking-wide text-slate-500">
        {businessLabels.prepaid.adminDebt}
      </p>

      <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
        <div>
          <dt className="text-slate-500">{businessLabels.prepaid.fullPrice}</dt>
          <dd className="tabular-nums text-slate-700">{formatMoney(item.fullAmount)}</dd>
        </div>
        <div>
          <dt className="text-slate-500">{businessLabels.prepaid.paid}</dt>
          <dd className="tabular-nums text-slate-700">{formatMoney(item.amountPaid)}</dd>
        </div>
        <div>
          <dt className="text-slate-500">{businessLabels.prepaid.remaining}</dt>
          <dd className="tabular-nums text-slate-700">
            {item.status === 'PENDING' ? formatMoney(item.remainingToCollect) : '—'}
          </dd>
        </div>
      </dl>

      <div className="mt-3">
        <PrepaidStatusBadge status={item.status} />
      </div>
    </article>
  );
};
