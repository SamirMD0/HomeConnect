import React from 'react';
import { useInstallmentPlanDetail } from '../hooks/useCustomerFinancialSummary';
import { InstallmentPlanDetail } from '../types/customer-financial.types';
import { formatBusinessDate, formatDateTime, formatMoney } from '../utils/financial-format';
import {
  canCancelInstallmentPlan,
  canRecordInstallmentPlanPayment,
} from '../utils/financial-auth';
import { FinancialErrorState } from './FinancialErrorState';
import { FinancialStatusBadge } from './FinancialStatusBadge';
import { RecentPaymentsList } from './RecentPaymentsList';

interface InstallmentPlanDetailsProps {
  planId: string | null;
  canMutate?: boolean;
  onRecordPayment?: (plan: InstallmentPlanDetail) => void;
  onCancelPlan?: (plan: InstallmentPlanDetail) => void;
}

export const InstallmentPlanDetails: React.FC<InstallmentPlanDetailsProps> = ({
  planId,
  canMutate = false,
  onRecordPayment,
  onCancelPlan,
}) => {
  const { data: plan, isLoading, isError, refetch } = useInstallmentPlanDetail(planId);

  if (isLoading) {
    return <div className="py-8 text-center text-sm text-slate-500">Loading plan details...</div>;
  }

  if (isError || !plan) {
    return (
      <FinancialErrorState
        message="Installment plan details could not be loaded."
        onRetry={() => {
          void refetch();
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="mb-2 flex flex-wrap items-center gap-3">
          <h3 className="text-lg font-semibold text-slate-900">{plan.description}</h3>
          <FinancialStatusBadge type="plan" status={plan.calculatedStatus} />
        </div>
        <p className="text-sm text-slate-500">Created {formatDateTime(plan.createdAt)} by {plan.createdBy.name}</p>
        {canMutate && (
          <div className="mt-4 flex flex-wrap gap-2">
            {canRecordInstallmentPlanPayment(plan.calculatedStatus) && onRecordPayment && (
              <button
                type="button"
                onClick={() => onRecordPayment(plan)}
                className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
              >
                Record payment
              </button>
            )}
            {canCancelInstallmentPlan(plan.calculatedStatus, plan.totalPaid) && onCancelPlan && (
              <button
                type="button"
                onClick={() => onCancelPlan(plan)}
                className="rounded-md border border-amber-200 px-3 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-50 focus:outline-none focus:ring-2 focus:ring-amber-500/30"
              >
                Cancel plan
              </button>
            )}
          </div>
        )}
      </div>

      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <DetailTerm label="Total amount" value={formatMoney(plan.totalAmount)} />
        <DetailTerm label="Total paid" value={formatMoney(plan.totalPaid)} />
        <DetailTerm label="Remaining balance" value={formatMoney(plan.remainingBalance)} />
        <DetailTerm label="Start date" value={formatBusinessDate(plan.startDate)} />
      </dl>

      <section aria-labelledby="installment-schedule-heading">
        <h4 id="installment-schedule-heading" className="mb-3 text-sm font-semibold text-slate-700">
          Schedule
        </h4>
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
              <tr>
                <th className="px-4 py-3">#</th>
                <th className="px-4 py-3">Due date</th>
                <th className="px-4 py-3 text-right">Amount due</th>
                <th className="px-4 py-3 text-right">Paid</th>
                <th className="px-4 py-3 text-right">Remaining</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Paid date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {plan.schedule.map((installment) => (
                <tr key={installment.id}>
                  <td className="px-4 py-3 font-medium text-slate-900">{installment.installmentNumber}</td>
                  <td className="px-4 py-3 text-slate-600">{formatBusinessDate(installment.dueDate)}</td>
                  <td className="px-4 py-3 text-right text-slate-700">{formatMoney(installment.amountDue)}</td>
                  <td className="px-4 py-3 text-right text-slate-700">{formatMoney(installment.totalPaid)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-900">{formatMoney(installment.remainingAmount)}</td>
                  <td className="px-4 py-3">
                    <FinancialStatusBadge type="installment" status={installment.status} />
                  </td>
                  <td className="px-4 py-3 text-slate-600">{formatBusinessDate(installment.paidDate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <RecentPaymentsList payments={plan.payments} />
    </div>
  );
};

const DetailTerm: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="rounded-lg border border-slate-200 bg-white p-4">
    <dt className="text-sm font-medium text-slate-500">{label}</dt>
    <dd className="mt-1 text-base font-semibold text-slate-900">{value}</dd>
  </div>
);
