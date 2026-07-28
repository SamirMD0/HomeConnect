import React from 'react';
import { RecentFinancialPayment } from '../types/customer-financial.types';
import { formatBusinessDate, formatDateTime, formatMoney } from '../utils/financial-format';
import { allocationTargetLabels, paymentMethodLabels } from '../utils/financial-labels';
import { FinancialEmptyState } from './FinancialEmptyState';

interface RecentPaymentsListProps {
  payments: RecentFinancialPayment[];
  canMutate?: boolean;
  onVoidPayment?: (payment: RecentFinancialPayment) => void;
  onReallocatePayment?: (payment: RecentFinancialPayment) => void;
}

export const RecentPaymentsList: React.FC<RecentPaymentsListProps> = ({
  payments,
  canMutate = false,
  onVoidPayment,
  onReallocatePayment,
}) => {
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
                {payment.reference && <p className="user-text mt-2 text-sm text-slate-600" dir="auto">Reference: {payment.reference}</p>}
                {payment.notes && <p className="user-text-pre mt-1 text-sm text-slate-600" dir="auto">{payment.notes}</p>}
                {payment.voidReason && <p className="user-text mt-1 text-sm text-slate-600" dir="auto">Void reason: {payment.voidReason}</p>}
              </div>
              {canMutate && !payment.voidedAt && (
                <div className="flex flex-wrap gap-2 sm:justify-end">
                  {onReallocatePayment && isInstallmentPayment(payment) && (
                    <button
                      type="button"
                      onClick={() => onReallocatePayment(payment)}
                      className="rounded-md border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                    >
                      Reallocate
                    </button>
                  )}
                  {onVoidPayment && (
                    <button
                      type="button"
                      onClick={() => onVoidPayment(payment)}
                      className="rounded-md border border-red-200 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500/30"
                    >
                      Void payment
                    </button>
                  )}
                </div>
              )}
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
                      <span className="user-text text-slate-500" dir="auto"> · {allocation.description || 'No description'}</span>
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

function isInstallmentPayment(payment: RecentFinancialPayment): boolean {
  return (
    payment.allocations.length > 0 &&
    payment.allocations.every((allocation) => allocation.targetType === 'INSTALLMENT')
  );
}
