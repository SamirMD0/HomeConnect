import React from 'react';
import { DebtSummaryItem } from '../types/customer-financial.types';
import { formatBusinessDate, formatDateTime, formatMoney } from '../utils/financial-format';
import { canCancelDebt, canRecordDebtPayment } from '../utils/financial-auth';
import { FinancialEmptyState } from './FinancialEmptyState';
import { FinancialStatusBadge } from './FinancialStatusBadge';

interface CustomerDebtsListProps {
  debts: DebtSummaryItem[];
  onOpenDebt: (debtId: string) => void;
  canMutate?: boolean;
  onRecordPayment?: (debt: DebtSummaryItem) => void;
  onCancelDebt?: (debt: DebtSummaryItem) => void;
}

export const CustomerDebtsList: React.FC<CustomerDebtsListProps> = ({
  debts,
  onOpenDebt,
  canMutate = false,
  onRecordPayment,
  onCancelDebt,
}) => {
  if (debts.length === 0) {
    return (
      <FinancialEmptyState
        title="No single debts"
        description="This customer has no single-debt records in the financial profile."
      />
    );
  }

  return (
    <section aria-labelledby="customer-debts-heading">
      <h2 id="customer-debts-heading" className="mb-4 text-lg font-semibold text-slate-900">
        Single debts
      </h2>
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
            <tr>
              <th className="px-4 py-3">Debt</th>
              <th className="px-4 py-3 text-right">Original</th>
              <th className="px-4 py-3 text-right">Paid</th>
              <th className="px-4 py-3 text-right">Remaining</th>
              <th className="px-4 py-3">Due date</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Created</th>
              <th className="px-4 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {debts.map((debt) => (
              <tr key={debt.id} className="align-top">
                <td className="px-4 py-3">
                  <p className="font-medium text-slate-900">{debt.description}</p>
                  {debt.cancellation && (
                    <p className="mt-1 text-xs text-slate-500">Cancelled: {debt.cancellation.reason || 'No reason recorded'}</p>
                  )}
                </td>
                <td className="px-4 py-3 text-right text-slate-700">{formatMoney(debt.originalAmount)}</td>
                <td className="px-4 py-3 text-right text-slate-700">{formatMoney(debt.totalPaid)}</td>
                <td className="px-4 py-3 text-right font-semibold text-slate-900">{formatMoney(debt.remainingBalance)}</td>
                <td className="px-4 py-3 text-slate-600">{formatBusinessDate(debt.dueDate)}</td>
                <td className="px-4 py-3">
                  <FinancialStatusBadge type="debt" status={debt.calculatedStatus} />
                </td>
                <td className="px-4 py-3 text-slate-600">{formatDateTime(debt.createdAt)}</td>
                <td className="px-4 py-3 text-right">
                  <div className="flex flex-wrap justify-end gap-2">
                    {canMutate && canRecordDebtPayment(debt.calculatedStatus) && onRecordPayment && (
                      <button
                        type="button"
                        onClick={() => onRecordPayment(debt)}
                        className="rounded-md border border-emerald-200 px-3 py-1.5 text-sm font-medium text-emerald-700 hover:bg-emerald-50 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                      >
                        Payment
                      </button>
                    )}
                    {canMutate && canCancelDebt(debt.calculatedStatus, debt.totalPaid) && onCancelDebt && (
                      <button
                        type="button"
                        onClick={() => onCancelDebt(debt)}
                        className="rounded-md border border-amber-200 px-3 py-1.5 text-sm font-medium text-amber-700 hover:bg-amber-50 focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                      >
                        Cancel
                      </button>
                    )}
                  <button
                    type="button"
                    onClick={() => onOpenDebt(debt.id)}
                    className="rounded-md border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                  >
                    View
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
