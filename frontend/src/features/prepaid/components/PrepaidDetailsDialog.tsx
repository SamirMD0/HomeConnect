import React from 'react';
import { PrepaidPurchase } from '../types/prepaid.types';
import { PrepaidStatusBadge } from './PrepaidStatusBadge';
import { formatBusinessDate, formatMoney } from '../../customer-financial/utils/financial-format';
import { businessLabels } from '../../../shared/labels/business-labels';

interface PrepaidDetailsDialogProps {
  item: PrepaidPurchase;
}

const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="flex items-start justify-between gap-4 border-b border-slate-100 py-2 last:border-0">
    <dt className="text-sm text-slate-500">{label}</dt>
    <dd className="text-right text-sm font-medium text-slate-900">{children}</dd>
  </div>
);

export const PrepaidDetailsDialog: React.FC<PrepaidDetailsDialogProps> = ({ item }) => (
  <div>
    <div className="mb-3 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="user-text font-semibold text-slate-900" dir="auto">
          {item.itemName}
        </p>
        <p className="user-text text-sm text-slate-600" dir="auto">
          {item.customer.name} · {item.customer.phone}
        </p>
      </div>
      <PrepaidStatusBadge status={item.status} />
    </div>

    <dl>
      <Row label={businessLabels.prepaid.fullPrice}>
        <span className="tabular-nums">{formatMoney(item.fullAmount)}</span>
      </Row>
      <Row label={businessLabels.prepaid.paid}>
        <span className="tabular-nums">{formatMoney(item.amountPaid)}</span>
      </Row>
      <Row label={businessLabels.prepaid.adminDebt}>
        <span
          className={`tabular-nums ${Number(item.adminDebt) === 0 ? 'text-slate-400' : 'text-red-600'}`}
        >
          {formatMoney(item.adminDebt)}
        </span>
      </Row>
      <Row label={businessLabels.prepaid.remaining}>
        <span className="tabular-nums">{formatMoney(item.remainingToCollect)}</span>
      </Row>
      <Row label={businessLabels.common.created}>
        {formatBusinessDate(item.createdAt.slice(0, 10))}
      </Row>
      {item.deliveredAt && (
        <Row label={businessLabels.prepaid.deliveredOn}>
          {formatBusinessDate(item.deliveredAt)}
          {item.deliveredBy && (
            <span className="user-text block text-xs font-normal text-slate-500" dir="auto">
              {item.deliveredBy.name}
            </span>
          )}
        </Row>
      )}
      {item.deliveryNotes && (
        <Row label={businessLabels.prepaid.deliveryNotes}>
          <span className="user-text-pre block font-normal" dir="auto">
            {item.deliveryNotes}
          </span>
        </Row>
      )}
      {item.notes && (
        <Row label={businessLabels.common.notes}>
          <span className="user-text-pre block font-normal" dir="auto">
            {item.notes}
          </span>
        </Row>
      )}
    </dl>
  </div>
);
