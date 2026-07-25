import React from 'react';
import { RecentFinancialPayment } from '../types/customer-financial.types';
import { formatBusinessDate, formatDateTime, formatMoney } from '../utils/financial-format';
import { allocationTargetLabels, paymentMethodLabels } from '../utils/financial-labels';
import { FinancialEmptyState } from './FinancialEmptyState';

interface RecentPaymentsListProps {
  payments: RecentFinancialPayment[];
}

export const RecentPaymentsList: React.FC<RecentPaymentsListProps> = ({ payments }) => {
  if (payments.length === 0) {
    return (
      <FinancialEmptyState
        title="No recent payments"
        description="No financial payment history was returned for this customer."
      />
    );
  }

  return (
    <section aria-labelledby="recent-payments-heading">
      <h2 id="recent-payments-heading" className="mb-4 text-lg font-semibold text-slate-900">
        Recent payments
      </h2>
      <div className="space-y-4">
        {payments.map((payment) => (
          <article key={payment.id} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold text-slate-900">{formatMoney(payment.totalAmount)}</h3>
                  {payment.voidedAt && (
                    <span className="inline-flex rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700 ring-1 ring-inset ring-slate-600/10">
                      Voided
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm text-slate-500">
                  {formatBusinessDate(payment.paymentDate)} · {paymentMethodLabels[payment.paymentMethod]} · Created by {payment.createdBy.name}
                </p>
                <p className="mt-1 text-xs text-slate-500">{formatDateTime(payment.createdAt)}</p>
                {payment.reference && <p className="mt-2 text-sm text-slate-600">Reference: {payment.reference}</p>}
                {payment.notes && <p className="mt-1 text-sm text-slate-600">{payment.notes}</p>}
                {payment.voidReason && <p className="mt-1 text-sm text-slate-600">Void reason: {payment.voidReason}</p>}
              </div>
            </div>

            <div className="mt-4 rounded-lg border border-slate-100 bg-slate-50">
              <div className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Allocations
              </div>
              <ul className="divide-y divide-slate-100 bg-white">
                {payment.allocations.map((allocation) => (
                  <li
                    key={allocation.id}
                    className="flex flex-col gap-1 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <span className="font-medium text-slate-800">
                        {allocationTargetLabels[allocation.targetType]}
                      </span>
                      <span className="text-slate-500"> · {allocation.description || 'No description'}</span>
                    </div>
                    <span className="font-semibold text-slate-900">{formatMoney(allocation.amount)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
};
