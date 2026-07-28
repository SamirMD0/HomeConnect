import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CalendarClock, ReceiptText } from 'lucide-react';
import { FinancialStatusBadge } from '../../customer-financial/components/FinancialStatusBadge';
import { useCustomerFinancialSummary } from '../../customer-financial/hooks/useCustomerFinancialSummary';
import { formatBusinessDate, formatMoney } from '../../customer-financial/utils/financial-format';
import { paymentMethodLabels } from '../../customer-financial/utils/financial-labels';

interface ReceivableExpandedPanelProps {
  customerId: string;
  customerName: string;
}

const PAYMENTS_SHOWN = 5;

export const ReceivableExpandedPanel: React.FC<ReceivableExpandedPanelProps> = ({
  customerId,
  customerName,
}) => {
  const { data, isLoading, isError, refetch } = useCustomerFinancialSummary(customerId, {
    includeCancelled: false,
    includePayments: true,
    paymentLimit: PAYMENTS_SHOWN,
    debtLimit: 50,
    planLimit: 50,
  });

  if (isLoading) {
    return (
      <div className="space-y-2" aria-busy="true">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="h-4 animate-pulse rounded bg-slate-200/70" />
        ))}
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex flex-wrap items-center gap-3 text-xs text-red-700" role="alert">
        <span>Details for {customerName} could not be loaded.</span>
        <button
          type="button"
          onClick={() => {
            void refetch();
          }}
          className="rounded-md border border-red-200 bg-white px-2 py-1 font-semibold hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/30"
        >
          Retry
        </button>
      </div>
    );
  }

  const openDebts = data.debts.filter(
    (debt) => debt.calculatedStatus !== 'PAID' && debt.calculatedStatus !== 'CANCELLED'
  );
  const openPlans = data.installmentPlans.filter(
    (plan) => plan.calculatedStatus !== 'COMPLETED' && plan.calculatedStatus !== 'CANCELLED'
  );
  const payments = data.recentPayments.slice(0, PAYMENTS_SHOWN);

  return (
    <div className="grid gap-6 text-xs lg:grid-cols-2">
      <section>
        <h3 className="mb-2 font-semibold uppercase tracking-wide text-slate-500">
          Open obligations
        </h3>
        {openDebts.length === 0 && openPlans.length === 0 ? (
          <p className="text-slate-500">No open debts or installment plans.</p>
        ) : (
          <ul className="space-y-1.5">
            {openDebts.map((debt) => (
              <li
                key={debt.id}
                className="flex items-center justify-between gap-3 rounded-md bg-white px-3 py-2 ring-1 ring-slate-200/70"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <ReceiptText className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-slate-800">
                      {debt.description}
                    </span>
                    <span className="text-slate-500">Due {formatBusinessDate(debt.dueDate)}</span>
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="tabular-nums font-medium text-slate-800">
                    {formatMoney(debt.remainingBalance)}
                  </span>
                  <FinancialStatusBadge status={debt.calculatedStatus} type="debt" />
                </span>
              </li>
            ))}
            {openPlans.map((plan) => (
              <li
                key={plan.id}
                className="flex items-center justify-between gap-3 rounded-md bg-white px-3 py-2 ring-1 ring-slate-200/70"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <CalendarClock className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-slate-800">
                      {plan.description}
                    </span>
                    <span className="text-slate-500">
                      {plan.scheduleSummary.completedInstallments}/
                      {plan.scheduleSummary.totalInstallments} installments
                      {plan.nextDueDate ? ` · next ${formatBusinessDate(plan.nextDueDate)}` : ''}
                    </span>
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="tabular-nums font-medium text-slate-800">
                    {formatMoney(plan.remainingBalance)}
                  </span>
                  <FinancialStatusBadge status={plan.calculatedStatus} type="plan" />
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="mb-2 font-semibold uppercase tracking-wide text-slate-500">
          Recent payments
        </h3>
        {payments.length === 0 ? (
          <p className="text-slate-500">No payments recorded yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {payments.map((payment) => (
              <li
                key={payment.id}
                className="flex items-center justify-between gap-3 rounded-md bg-white px-3 py-2 ring-1 ring-slate-200/70"
              >
                <span className="min-w-0">
                  <span className="block font-medium text-slate-800">
                    {formatBusinessDate(payment.paymentDate)} ·{' '}
                    {paymentMethodLabels[payment.paymentMethod]}
                  </span>
                  <span className="block truncate text-slate-500">
                    {payment.reference || 'No reference'}
                    {payment.allocations.length > 0
                      ? ` → ${payment.allocations.length} item${payment.allocations.length === 1 ? '' : 's'}`
                      : ''}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span
                    className={`tabular-nums font-medium ${payment.voidedAt ? 'text-slate-400 line-through' : 'text-slate-800'}`}
                  >
                    {formatMoney(payment.totalAmount)}
                  </span>
                  {payment.voidedAt && (
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-500">
                      Voided
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}

        <Link
          to={`/customers/${customerId}`}
          className="mt-3 inline-flex items-center gap-1 font-semibold text-emerald-700 hover:text-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30"
        >
          Open full profile
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </section>
    </div>
  );
};
