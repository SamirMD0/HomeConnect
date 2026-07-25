import React from 'react';
import {
  FinancialLedgerDebtItem,
  FinancialLedgerItem,
  FinancialLedgerPlanItem,
} from '../types/financial-ledger.types';
import { formatBusinessDate, formatDateTime, formatMoney } from '../../customer-financial/utils/financial-format';
import { FinancialStatusBadge } from '../../customer-financial/components/FinancialStatusBadge';
import {
  canCancelDebt,
  canCancelInstallmentPlan,
  canRecordDebtPayment,
  canRecordInstallmentPlanPayment,
} from '../../customer-financial/utils/financial-auth';

interface LedgerTableProps {
  items: FinancialLedgerItem[];
  canMutate: boolean;
  onViewDebt: (debtId: string) => void;
  onViewPlan: (planId: string) => void;
  onRecordDebtPayment: (debt: FinancialLedgerDebtItem) => void;
  onCancelDebt: (debt: FinancialLedgerDebtItem) => void;
  onRecordPlanPayment: (plan: FinancialLedgerPlanItem) => void;
  onCancelPlan: (plan: FinancialLedgerPlanItem) => void;
}

export const LedgerTable: React.FC<LedgerTableProps> = ({
  items,
  canMutate,
  onViewDebt,
  onViewPlan,
  onRecordDebtPayment,
  onCancelDebt,
  onRecordPlanPayment,
  onCancelPlan,
}) => (
  <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
          <tr>
            <th className="px-4 py-3">Date</th>
            <th className="px-4 py-3">Customer</th>
            <th className="px-4 py-3">Type</th>
            <th className="px-4 py-3">Description</th>
            <th className="px-4 py-3">Due / Payment</th>
            <th className="px-4 py-3 text-right">Original / Total</th>
            <th className="px-4 py-3 text-right">Paid</th>
            <th className="px-4 py-3 text-right">Remaining</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {items.map((item) => (
            <LedgerRow
              key={`${item.type}-${item.id}`}
              item={item}
              canMutate={canMutate}
              onViewDebt={onViewDebt}
              onViewPlan={onViewPlan}
              onRecordDebtPayment={onRecordDebtPayment}
              onCancelDebt={onCancelDebt}
              onRecordPlanPayment={onRecordPlanPayment}
              onCancelPlan={onCancelPlan}
            />
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

type LedgerRowProps = Omit<LedgerTableProps, 'items'> & { item: FinancialLedgerItem };

const LedgerRow: React.FC<LedgerRowProps> = ({
  item,
  canMutate,
  onViewDebt,
  onViewPlan,
  onRecordDebtPayment,
  onCancelDebt,
  onRecordPlanPayment,
  onCancelPlan,
}) => {
  if (item.type === 'DEBT') {
    return (
      <tr className="align-top">
        <BaseCells
          date={formatDateTime(item.createdAt)}
          customer={item.customer}
          typeLabel="Debt"
          description={item.description}
          dueOrPayment={formatBusinessDate(item.dueDate)}
          originalOrTotal={formatMoney(item.originalAmount)}
          paid={formatMoney(item.totalPaid)}
          remaining={formatMoney(item.remainingBalance)}
        />
        <td className="px-4 py-3">
          <FinancialStatusBadge type="debt" status={item.status} />
        </td>
        <td className="px-4 py-3 text-right">
          <div className="flex flex-wrap justify-end gap-2">
            {canMutate && canRecordDebtPayment(item.status) && (
              <button type="button" onClick={() => onRecordDebtPayment(item)} className={actionClass('pay')}>
                Payment
              </button>
            )}
            {canMutate && canCancelDebt(item.status, item.totalPaid) && (
              <button type="button" onClick={() => onCancelDebt(item)} className={actionClass('cancel')}>
                Cancel
              </button>
            )}
            <button type="button" onClick={() => onViewDebt(item.id)} className={actionClass('view')}>
              View
            </button>
          </div>
        </td>
      </tr>
    );
  }

  if (item.type === 'INSTALLMENT_PLAN') {
    return (
      <tr className="align-top">
        <BaseCells
          date={formatDateTime(item.createdAt)}
          customer={item.customer}
          typeLabel="Installment Plan"
          description={`${item.description} (${item.completedInstallmentCount}/${item.installmentCount} complete)`}
          dueOrPayment={formatBusinessDate(item.nextDueDate)}
          originalOrTotal={formatMoney(item.totalAmount)}
          paid={formatMoney(item.totalPaid)}
          remaining={formatMoney(item.remainingBalance)}
        />
        <td className="px-4 py-3">
          <FinancialStatusBadge type="plan" status={item.status} />
        </td>
        <td className="px-4 py-3 text-right">
          <div className="flex flex-wrap justify-end gap-2">
            {canMutate && canRecordInstallmentPlanPayment(item.status) && (
              <button type="button" onClick={() => onRecordPlanPayment(item)} className={actionClass('pay')}>
                Payment
              </button>
            )}
            {canMutate && canCancelInstallmentPlan(item.status, item.totalPaid) && (
              <button type="button" onClick={() => onCancelPlan(item)} className={actionClass('cancel')}>
                Cancel
              </button>
            )}
            <button type="button" onClick={() => onViewPlan(item.id)} className={actionClass('view')}>
              View
            </button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className="align-top">
      <BaseCells
        date={formatDateTime(item.createdAt)}
        customer={item.customer}
        typeLabel="Payment"
        description={allocationSummary(item)}
        dueOrPayment={formatBusinessDate(item.paymentDate)}
        originalOrTotal={formatMoney(item.amount)}
        paid="—"
        remaining="—"
      />
      <td className="px-4 py-3">
        <span className="inline-flex rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-600/20">
          {item.status === 'VOIDED' ? 'Voided' : 'Completed'}
        </span>
      </td>
      <td className="px-4 py-3 text-right">
        <span className="text-xs text-slate-400">Immutable</span>
      </td>
    </tr>
  );
};

interface BaseCellsProps {
  date: string;
  customer: { name: string; phone: string };
  typeLabel: string;
  description: string;
  dueOrPayment: string;
  originalOrTotal: string;
  paid: string;
  remaining: string;
}

const BaseCells: React.FC<BaseCellsProps> = ({
  date,
  customer,
  typeLabel,
  description,
  dueOrPayment,
  originalOrTotal,
  paid,
  remaining,
}) => (
  <>
    <td className="px-4 py-3 whitespace-nowrap text-slate-600">{date}</td>
    <td className="px-4 py-3">
      <p className="font-medium text-slate-900">{customer.name}</p>
      <p className="text-xs text-slate-500">{customer.phone}</p>
    </td>
    <td className="px-4 py-3">
      <span className="inline-flex rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
        {typeLabel}
      </span>
    </td>
    <td className="px-4 py-3 text-slate-700">{description}</td>
    <td className="px-4 py-3 whitespace-nowrap text-slate-600">{dueOrPayment}</td>
    <td className="px-4 py-3 text-right font-medium text-slate-900">{originalOrTotal}</td>
    <td className="px-4 py-3 text-right text-slate-700">{paid}</td>
    <td className="px-4 py-3 text-right font-semibold text-slate-900">{remaining}</td>
  </>
);

function allocationSummary(item: Extract<FinancialLedgerItem, { type: 'PAYMENT' }>): string {
  if (item.allocations.length === 0) return item.reference || 'Payment';
  return item.allocations
    .map((allocation) => `${allocation.description || 'Unknown target'} ${formatMoney(allocation.amount)}`)
    .join(', ');
}

function actionClass(kind: 'pay' | 'cancel' | 'view') {
  if (kind === 'pay') {
    return 'rounded-md border border-emerald-200 px-3 py-1.5 text-sm font-medium text-emerald-700 hover:bg-emerald-50 focus:outline-none focus:ring-2 focus:ring-emerald-500/30';
  }
  if (kind === 'cancel') {
    return 'rounded-md border border-amber-200 px-3 py-1.5 text-sm font-medium text-amber-700 hover:bg-amber-50 focus:outline-none focus:ring-2 focus:ring-amber-500/30';
  }
  return 'rounded-md border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-500/30';
}
