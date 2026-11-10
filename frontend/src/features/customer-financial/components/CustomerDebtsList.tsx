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
        title="No invoices"
        description="This customer has no open or past invoices. Deposits for items awaiting delivery are on the Deposits tab."
      />
    );
  }

  return (
    <section aria-labelledby="customer-debts-heading">
      <h2 id="customer-debts-heading" className="mb-4 text-lg font-semibold text-slate-900">
        Invoices</h2>
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-100 text-left text-xs font-semibold text-slate-700">
            <tr>
              <th className="px-4 py-3">Invoice</th>
              <th className="px-4 py-3 text-right">Amount</th>
              <th className="px-4 py-3 text-right">Paid</th>
              <th className="px-4 py-3 text-right">Balance due</th>
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
                  <p className="user-text font-medium text-slate-900" dir="auto">{debt.description}</p>
                  {debt.kind === 'PREPAID_PURCHASE' && (
                    <span className="mt-1 inline-flex rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700 ring-1 ring-brand-600/20">
                      Deposit</span>
                  )}
                  {debt.cancellation && (
                    <p className="user-text mt-1 text-xs text-slate-500" dir="auto">Cancelled: {debt.cancellation.reason || 'No reason recorded'}</p>
                  )}
                </td>
                <td className="px-4 py-3 text-right text-slate-700">{formatMoney(debt.originalAmount)}</td>
                <td className="px-4 py-3 text-right text-slate-700">{formatMoney(debt.totalPaid)}</td>
                <td className={`px-4 py-3 text-right font-semibold ${debt.kind === 'PREPAID_PURCHASE' ? 'text-red-700' : 'text-slate-900'}`}>
                  {formatMoney(debt.kind === 'PREPAID_PURCHASE' ? debt.adminDebt : debt.remainingBalance)}
                </td>
                <td className="px-4 py-3 text-slate-600">{debt.kind === 'PREPAID_PURCHASE' ? 'Reserved' : formatBusinessDate(debt.dueDate)}</td>
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
                        className="rounded-md border border-brand-200 px-3 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-50 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                      >
                        Payment
                      </button>
                    )}
                    {canMutate && canCancelDebt(debt.calculatedStatus, debt.totalPaid, debt.kind) && onCancelDebt && (
                      <button
                        type="button"
                        onClick={() => onCancelDebt(debt)}
                        className="rounded-md border border-amber-200 px-3 py-1.5 text-sm font-medium text-amber-700 hover:bg-amber-50 focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                      >
                        {debt.kind === 'PREPAID_PURCHASE' ? 'Cancel pre-paid' : 'Cancel'}
                      </button>
                    )}
                  <button
                    type="button"
                    onClick={() => onOpenDebt(debt.id)}
                    className="rounded-md border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
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
