import React from 'react';
import { PrepaidPayment } from '../types/prepaid.types';
import {
  formatBusinessDate,
  formatMoney,
} from '../../customer-financial/utils/financial-format';
import { paymentMethodLabels } from '../../customer-financial/utils/financial-labels';
import { businessLabels } from '../../../shared/labels/business-labels';

interface PrepaidBillHistoryProps {
  payments: PrepaidPayment[];
  /** Heading is dropped when the caller already labels the section. */
  showHeading?: boolean;
}

/**
 * Every bill the customer paid towards one prepaid item, oldest first.
 * A voided bill stays listed so the history is never rewritten; it is struck
 * through instead, because it no longer counts towards the balance.
 */
export const PrepaidBillHistory: React.FC<PrepaidBillHistoryProps> = ({
  payments,
  showHeading = true,
}) => {
  if (payments.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-center text-sm text-slate-500">
        {businessLabels.prepaid.noBills}
      </div>
    );
  }

  return (
    <section aria-label={businessLabels.prepaid.billHistory}>
      {showHeading && (
        <h4 className="mb-2 text-sm font-semibold text-slate-900">
          {businessLabels.prepaid.billHistory}
        </h4>
      )}
      <ol className="divide-y divide-slate-100 rounded-lg border border-slate-200">
        {payments.map((payment, index) => (
          <li key={payment.id} className="flex flex-wrap items-start justify-between gap-3 px-3 py-2">
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-900">
                <span className="mr-2 text-xs font-semibold text-slate-400">#{index + 1}</span>
                {formatBusinessDate(payment.paymentDate)}
                {payment.isVoided && (
                  <span className="ml-2 inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600 ring-1 ring-slate-600/10">
                    {businessLabels.prepaid.voidedBill}
                  </span>
                )}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                {paymentMethodLabels[payment.paymentMethod]}
                {payment.reference && (
                  <span className="user-text" dir="auto">
                    {' · '}
                    {businessLabels.prepaid.receiptNumber}: {payment.reference}
                  </span>
                )}
              </p>
              {payment.recordedBy && (
                <p className="user-text mt-0.5 text-xs text-slate-500" dir="auto">
                  {businessLabels.prepaid.recordedBy}: {payment.recordedBy.name}
                </p>
              )}
              {payment.notes && (
                <p className="user-text-pre mt-0.5 text-xs text-slate-500" dir="auto">
                  {payment.notes}
                </p>
              )}
            </div>
            <span
              className={`shrink-0 text-sm font-semibold tabular-nums ${
                payment.isVoided ? 'text-slate-400 line-through' : 'text-emerald-700'
              }`}
            >
              {formatMoney(payment.amount)}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
};
