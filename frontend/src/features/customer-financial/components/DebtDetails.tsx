import React from 'react';
import { useDebtDetail } from '../hooks/useCustomerFinancialSummary';
import { DebtDetail, RecentFinancialPayment } from '../types/customer-financial.types';
import { formatBusinessDate, formatDateTime, formatMoney } from '../utils/financial-format';
import { canCancelDebt, canRecordDebtPayment } from '../utils/financial-auth';
import { FinancialErrorState } from './FinancialErrorState';
import { FinancialStatusBadge } from './FinancialStatusBadge';
import { RecentPaymentsList } from './RecentPaymentsList';

interface DebtDetailsProps {
  debtId: string | null;
  canMutate?: boolean;
  onEditDebt?: (debt: DebtDetail) => void;
  onRecordPayment?: (debt: DebtDetail) => void;
  onCancelDebt?: (debt: DebtDetail) => void;
  onVoidPayment?: (payment: RecentFinancialPayment) => void;
}

export const DebtDetails: React.FC<DebtDetailsProps> = ({
  debtId,
  canMutate = false,
  onEditDebt,
  onRecordPayment,
  onCancelDebt,
  onVoidPayment,
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
          <h3 className="user-text text-lg font-semibold text-slate-900" dir="auto">{debt.description}</h3>
          <FinancialStatusBadge type="debt" status={debt.calculatedStatus} />
        </div>
        <p className="text-sm text-slate-500">Created {formatDateTime(debt.createdAt)} by {debt.createdBy.name}</p>
        {canMutate && (
          <div className="mt-4 flex flex-wrap gap-2">
            {onEditDebt && (
              <button
                type="button"
                onClick={() => onEditDebt(debt)}
                className="rounded-md border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
              >
                Edit
              </button>
            )}
            {canRecordDebtPayment(debt.calculatedStatus) && onRecordPayment && (
              <button
                type="button"
                onClick={() => onRecordPayment(debt)}
                className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
              >
                Record payment
              </button>
            )}
            {onCancelDebt && canCancelDebt(debt.calculatedStatus, debt.totalPaid) && (
              <button
                type="button"
                onClick={() => onCancelDebt(debt)}
                title="Delete by cancelling this debt while preserving payment and audit history."
                className="rounded-md border border-red-200 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500/30"
              >
                Delete debt
              </button>
            )}
            {onCancelDebt && !canCancelDebt(debt.calculatedStatus, debt.totalPaid) && debt.totalPaid !== '0.00' && (
              <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800">
                Void or reverse payments before deleting this debt.
              </p>
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
          <p className="user-text-pre mt-1 text-sm text-slate-600" dir="auto">{debt.notes}</p>
        </div>
      )}

      {debt.cancellation && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          Cancelled {formatDateTime(debt.cancellation.cancelledAt)}
          {debt.cancellation.cancelledBy ? ` by ${debt.cancellation.cancelledBy.name}` : ''}
          {debt.cancellation.reason ? <span className="user-text" dir="auto">: {debt.cancellation.reason}</span> : ''}
        </div>
      )}

      <RecentPaymentsList
        payments={debt.payments}
        canMutate={canMutate}
        onVoidPayment={onVoidPayment}
      />
    </div>
  );
};

const DetailTerm: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="rounded-lg border border-slate-200 bg-white p-4">
    <dt className="text-sm font-medium text-slate-500">{label}</dt>
    <dd className="mt-1 text-base font-semibold text-slate-900">{value}</dd>
  </div>
);
