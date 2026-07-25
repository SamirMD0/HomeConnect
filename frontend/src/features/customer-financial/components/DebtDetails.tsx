import React from 'react';
import { useDebtDetail } from '../hooks/useCustomerFinancialSummary';
import { DebtDetail } from '../types/customer-financial.types';
import { formatBusinessDate, formatDateTime, formatMoney } from '../utils/financial-format';
import { canCancelDebt, canRecordDebtPayment } from '../utils/financial-auth';
import { FinancialErrorState } from './FinancialErrorState';
import { FinancialStatusBadge } from './FinancialStatusBadge';
import { RecentPaymentsList } from './RecentPaymentsList';

interface DebtDetailsProps {
  debtId: string | null;
  canMutate?: boolean;
  onRecordPayment?: (debt: DebtDetail) => void;
  onCancelDebt?: (debt: DebtDetail) => void;
}

export const DebtDetails: React.FC<DebtDetailsProps> = ({
  debtId,
  canMutate = false,
  onRecordPayment,
  onCancelDebt,
}) => {
  const { data: debt, isLoading, isError, refetch } = useDebtDetail(debtId);

  if (isLoading) {
    return <div className="py-8 text-center text-sm text-slate-500">Loading debt details...</div>;
  }

  if (isError || !debt) {
    return (
      <FinancialErrorState
        message="Debt details could not be loaded."
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
          <h3 className="text-lg font-semibold text-slate-900">{debt.description}</h3>
          <FinancialStatusBadge type="debt" status={debt.calculatedStatus} />
        </div>
        <p className="text-sm text-slate-500">Created {formatDateTime(debt.createdAt)} by {debt.createdBy.name}</p>
        {canMutate && (
          <div className="mt-4 flex flex-wrap gap-2">
            {canRecordDebtPayment(debt.calculatedStatus) && onRecordPayment && (
              <button
                type="button"
                onClick={() => onRecordPayment(debt)}
                className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
              >
                Record payment
              </button>
            )}
            {canCancelDebt(debt.calculatedStatus, debt.totalPaid) && onCancelDebt && (
              <button
                type="button"
                onClick={() => onCancelDebt(debt)}
                className="rounded-md border border-amber-200 px-3 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-50 focus:outline-none focus:ring-2 focus:ring-amber-500/30"
              >
                Cancel debt
              </button>
            )}
          </div>
        )}
      </div>

      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <DetailTerm label="Original amount" value={formatMoney(debt.originalAmount)} />
        <DetailTerm label="Total paid" value={formatMoney(debt.totalPaid)} />
        <DetailTerm label="Remaining balance" value={formatMoney(debt.remainingBalance)} />
        <DetailTerm label="Due date" value={formatBusinessDate(debt.dueDate)} />
      </dl>

      {debt.notes && (
        <div>
          <h4 className="text-sm font-semibold text-slate-700">Notes</h4>
          <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{debt.notes}</p>
        </div>
      )}

      {debt.cancellation && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          Cancelled {formatDateTime(debt.cancellation.cancelledAt)}
          {debt.cancellation.cancelledBy ? ` by ${debt.cancellation.cancelledBy.name}` : ''}
          {debt.cancellation.reason ? `: ${debt.cancellation.reason}` : ''}
        </div>
      )}

      <RecentPaymentsList payments={debt.payments} />
    </div>
  );
};

const DetailTerm: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="rounded-lg border border-slate-200 bg-white p-4">
    <dt className="text-sm font-medium text-slate-500">{label}</dt>
    <dd className="mt-1 text-base font-semibold text-slate-900">{value}</dd>
  </div>
);
