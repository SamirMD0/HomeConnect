import React from 'react';
import { InstallmentPlanSummaryItem } from '../types/customer-financial.types';
import { formatBusinessDate, formatDateTime, formatMoney } from '../utils/financial-format';
import {
  canCancelInstallmentPlan,
  canRecordInstallmentPlanPayment,
} from '../utils/financial-auth';
import { FinancialEmptyState } from './FinancialEmptyState';
import { FinancialStatusBadge } from './FinancialStatusBadge';

interface InstallmentPlansListProps {
  plans: InstallmentPlanSummaryItem[];
  onOpenPlan: (planId: string) => void;
  canMutate?: boolean;
  onRecordPayment?: (plan: InstallmentPlanSummaryItem) => void;
  onCancelPlan?: (plan: InstallmentPlanSummaryItem) => void;
}

export const InstallmentPlansList: React.FC<InstallmentPlansListProps> = ({
  plans,
  onOpenPlan,
  canMutate = false,
  onRecordPayment,
  onCancelPlan,
}) => {
  if (plans.length === 0) {
    return (
      <FinancialEmptyState
        title="No payment plans"
        description="This customer has no payment plans."
      />
    );
  }

  return (
    <section aria-labelledby="installment-plans-heading">
      <h2 id="installment-plans-heading" className="mb-4 text-lg font-semibold text-slate-900">
        Payment plans
      </h2>
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-100 text-left text-xs font-semibold text-slate-700">
            <tr>
              <th className="px-4 py-3">Plan</th>
              <th className="px-4 py-3 text-right">Total</th>
              <th className="px-4 py-3 text-right">Paid</th>
              <th className="px-4 py-3 text-right">Balance due</th>
              <th className="px-4 py-3">Start</th>
              <th className="px-4 py-3">Progress</th>
              <th className="px-4 py-3">Next due</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {plans.map((plan) => (
              <tr key={plan.id} className="align-top">
                <td className="px-4 py-3">
                  <p className="user-text font-medium text-slate-900" dir="auto">{plan.description}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    Created {formatDateTime(plan.createdAt)}
                  </p>
                  {plan.cancellation && (
                    <p className="user-text mt-1 text-xs text-slate-500" dir="auto">Cancelled: {plan.cancellation.reason || 'No reason recorded'}</p>
                  )}
                </td>
                <td className="px-4 py-3 text-right text-slate-700">{formatMoney(plan.totalAmount)}</td>
                <td className="px-4 py-3 text-right text-slate-700">{formatMoney(plan.totalPaid)}</td>
                <td className="px-4 py-3 text-right font-semibold text-slate-900">{formatMoney(plan.remainingBalance)}</td>
                <td className="px-4 py-3 text-slate-600">{formatBusinessDate(plan.startDate)}</td>
                <td className="px-4 py-3 text-slate-600">
                  {plan.completedInstallmentCount}/{plan.installmentCount} complete
                  {plan.overdueInstallmentCount > 0 && (
                    <span className="block text-xs font-medium text-red-700">
                      {plan.overdueInstallmentCount} overdue
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-600">{formatBusinessDate(plan.nextDueDate)}</td>
                <td className="px-4 py-3">
                  <FinancialStatusBadge type="plan" status={plan.calculatedStatus} />
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex flex-wrap justify-end gap-2">
                    {canMutate &&
                      canRecordInstallmentPlanPayment(plan.calculatedStatus) &&
                      onRecordPayment && (
                        <button
                          type="button"
                          onClick={() => onRecordPayment(plan)}
                          className="rounded-md border border-brand-200 px-3 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-50 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                        >
                          Payment
                        </button>
                      )}
                    {canMutate &&
                      canCancelInstallmentPlan(plan.calculatedStatus, plan.totalPaid) &&
                      onCancelPlan && (
                        <button
                          type="button"
                          onClick={() => onCancelPlan(plan)}
                          className="rounded-md border border-amber-200 px-3 py-1.5 text-sm font-medium text-amber-700 hover:bg-amber-50 focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                        >
                          Cancel
                        </button>
                      )}
                  <button
                    type="button"
                    onClick={() => onOpenPlan(plan.id)}
                    className="rounded-md border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                  >
                    View schedule
                  </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
};
