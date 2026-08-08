import React from 'react';
import { ChevronDown } from 'lucide-react';
import { FinancialStatusBadge } from '../../customer-financial/components/FinancialStatusBadge';
import {
  canCancelDebt,
  canCancelInstallmentPlan,
  canRecordDebtPayment,
  canRecordInstallmentPlanPayment,
} from '../../customer-financial/utils/financial-auth';
import { formatBusinessDate, formatDateTime, formatMoney, positiveMoneyOrNull } from '../../customer-financial/utils/financial-format';
import {
  FinancialLedgerDebtItem,
  FinancialLedgerItem,
  FinancialLedgerPaymentItem,
  FinancialLedgerPlanItem,
} from '../types/financial-ledger.types';
import { LedgerPaymentChildPanel } from './LedgerPaymentChildRows';
import { LEDGER_CORRECTION_ENABLED, LedgerActionItem, LedgerRowActions } from './LedgerRowActions';
import { LedgerCustomerLink } from './LedgerCustomerLink';

interface LedgerMobileCardProps {
  item: FinancialLedgerItem;
  isExpanded: boolean;
  childRegionId: string;
  canMutate: boolean;
  openMenuKey: string | null;
  onToggleExpanded: () => void;
  onOpenMenuChange: (menuKey: string | null) => void;
  onViewDebt: (debtId: string) => void;
  onViewPlan: (planId: string) => void;
  onEditDebt: (debt: FinancialLedgerDebtItem) => void;
  onEditPlan: (plan: FinancialLedgerPlanItem) => void;
  onRecordDebtPayment: (debt: FinancialLedgerDebtItem) => void;
  onCancelDebt: (debt: FinancialLedgerDebtItem) => void;
  onRecordPlanPayment: (plan: FinancialLedgerPlanItem) => void;
  onCancelPlan: (plan: FinancialLedgerPlanItem) => void;
  onVoidPayment: (payment: FinancialLedgerPaymentItem) => void;
}

export const LedgerMobileCard: React.FC<LedgerMobileCardProps> = ({
  item,
  isExpanded,
  childRegionId,
  canMutate,
  openMenuKey,
  onToggleExpanded,
  onOpenMenuChange,
  onViewDebt,
  onViewPlan,
  onEditDebt,
  onEditPlan,
  onRecordDebtPayment,
  onCancelDebt,
  onRecordPlanPayment,
  onCancelPlan,
  onVoidPayment,
}) => {
  if (item.type === 'PAYMENT') {
    return (
      <article className="group rounded-lg border border-slate-200 bg-white p-3 shadow-sm transition-all duration-200 hover:border-yellow-300 hover:bg-gray-600 hover:shadow-[0_0_14px_rgba(250,204,21,0.3)]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <LedgerCustomerLink customer={item.customer} className="font-semibold" />
            <p className="text-xs text-slate-500 transition-colors group-hover:text-yellow-200">{formatBusinessDate(item.paymentDate)} · Payment</p>
          </div>
          <PaymentStatus status={item.status} />
        </div>
        <p className="mt-2 text-xl font-semibold tabular-nums text-slate-900 transition-colors group-hover:text-yellow-300">{formatMoney(item.amount)}</p>
        <p className="mt-1 line-clamp-2 text-sm text-slate-600 transition-colors group-hover:text-yellow-200">{paymentDescription(item)}</p>
        <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
          <p className="text-xs text-slate-500 transition-colors group-hover:text-yellow-200">Created {formatDateTime(item.createdAt)}</p>
          <LedgerRowActions
            menuKey={`mobile-${item.type}-${item.id}`}
            openMenuKey={openMenuKey}
            actions={
              canMutate && item.status !== 'VOIDED'
                ? [{ label: 'Void payment', onClick: () => onVoidPayment(item), tone: 'cancel' }]
                : []
            }
            immutableHint="Immutable"
            onOpenChange={onOpenMenuChange}
          />
        </div>
      </article>
    );
  }

  const isDebt = item.type === 'DEBT';
  const periodSummary = !isDebt ? item.periodSummary : null;
  const amount = isDebt ? item.originalAmount : (periodSummary?.totalDue ?? item.totalAmount);
  const totalPaid = periodSummary?.totalPaid ?? item.totalPaid;
  const remainingBalance = periodSummary?.totalRemaining ?? item.remainingBalance;
  const dueDate = isDebt ? item.dueDate : item.nextDueDate;
  const openEdit = () => {
    if (isDebt) {
      onEditDebt(item);
      return;
    }

    onEditPlan(item);
  };
  // Optional display-only field: a client can outlive the server build that added it.
  const saleDeposit = isDebt ? positiveMoneyOrNull(item.saleDepositAmount) : null;
  const actions = buildMobileObligationActions({
    item,
    canMutate,
    onViewDebt,
    onViewPlan,
    onRecordDebtPayment,
    onCancelDebt,
    onRecordPlanPayment,
    onCancelPlan,
  });

  return (
    <article className="group rounded-lg border border-slate-200 bg-white p-3 shadow-sm transition-all duration-200 hover:border-yellow-300 hover:bg-gray-600 hover:shadow-[0_0_14px_rgba(250,204,21,0.3)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <LedgerCustomerLink customer={item.customer} className="font-semibold" />
          <p className="text-xs text-slate-500 transition-colors group-hover:text-yellow-200">{item.customer.phone}</p>
        </div>
        <FinancialStatusBadge
          type={isDebt ? 'debt' : 'plan'}
          status={(isDebt ? item.displayStatus : item.status) ?? item.status}
        />
      </div>

      <p className="user-text mt-2 line-clamp-2 text-sm font-medium text-slate-800 transition-colors group-hover:text-yellow-300" dir="auto">{item.description}</p>
      {saleDeposit && (
        <p className="mt-1 text-xs text-slate-500 transition-colors group-hover:text-yellow-200">
          Deposit at sale: {formatMoney(saleDeposit)}
        </p>
      )}
      <p className="mt-3 text-xs font-medium uppercase tracking-wide text-slate-500 transition-colors group-hover:text-yellow-200">
        Remaining
      </p>
      <p className="text-xl font-semibold tabular-nums text-slate-900 transition-colors group-hover:text-yellow-300">
        {formatMoney(remainingBalance)}
      </p>

      <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
        <MobileAmountTerm label="Amount" value={formatMoney(amount)} />
        <MobileAmountTerm label="Paid" value={formatMoney(totalPaid)} />
        <MobileAmountTerm label="Due" value={formatBusinessDate(dueDate)} />
      </dl>

      <button
        type="button"
        aria-expanded={isExpanded}
        aria-controls={childRegionId}
        onClick={onToggleExpanded}
        className="mt-3 flex min-h-9 w-full items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 transition-all hover:border-yellow-300 hover:bg-gray-600 hover:text-yellow-300 focus:outline-none focus:ring-2 focus:ring-yellow-300/50"
      >
        <span>Payments</span>
        <ChevronDown className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
      </button>

      {isExpanded && (
        <LedgerPaymentChildPanel item={item} regionId={childRegionId} className="mt-3 rounded-md bg-slate-50 p-3" />
      )}

      <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
        <p className="text-xs text-slate-500 transition-colors group-hover:text-yellow-200">Created {formatDateTime(item.createdAt)}</p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              openEdit();
            }}
            className="inline-flex min-h-8 items-center rounded-md border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-600 transition-all hover:border-yellow-300 hover:bg-gray-600 hover:text-yellow-300 focus:outline-none focus:ring-2 focus:ring-yellow-300/50"
          >
            Edit
          </button>
          <LedgerRowActions
            menuKey={`mobile-${item.type}-${item.id}`}
            openMenuKey={openMenuKey}
            actions={actions}
            onOpenChange={onOpenMenuChange}
          />
        </div>
      </div>
    </article>
  );
};

const MobileAmountTerm: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="rounded-md bg-slate-50 px-2 py-2 transition-colors group-hover:bg-gray-700">
    <dt className="text-slate-500 transition-colors group-hover:text-yellow-200">{label}</dt>
    <dd className="mt-1 font-semibold tabular-nums text-slate-900 transition-colors group-hover:text-yellow-300">{value}</dd>
  </div>
);

const PaymentStatus: React.FC<{ status: FinancialLedgerPaymentItem['status'] }> = ({ status }) => (
  <span
    className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ring-1 ${
      status === 'VOIDED'
        ? 'bg-amber-50 text-amber-700 ring-amber-600/20'
        : 'bg-emerald-50 text-emerald-700 ring-emerald-600/20'
    }`}
  >
    {status === 'VOIDED' ? 'Voided' : 'Completed'}
  </span>
);

interface BuildMobileObligationActionsArgs {
  item: FinancialLedgerDebtItem | FinancialLedgerPlanItem;
  canMutate: boolean;
  onViewDebt: (debtId: string) => void;
  onViewPlan: (planId: string) => void;
  onRecordDebtPayment: (debt: FinancialLedgerDebtItem) => void;
  onCancelDebt: (debt: FinancialLedgerDebtItem) => void;
  onRecordPlanPayment: (plan: FinancialLedgerPlanItem) => void;
  onCancelPlan: (plan: FinancialLedgerPlanItem) => void;
}

function buildMobileObligationActions({
  item,
  canMutate,
  onViewDebt,
  onViewPlan,
  onRecordDebtPayment,
  onCancelDebt,
  onRecordPlanPayment,
  onCancelPlan,
}: BuildMobileObligationActionsArgs): LedgerActionItem[] {
  if (item.type === 'DEBT') {
    return [
      { label: 'View details', onClick: () => onViewDebt(item.id) },
      ...(canMutate && canRecordDebtPayment(item.status)
        ? [{ label: 'Record payment', onClick: () => onRecordDebtPayment(item), tone: 'pay' as const }]
        : []),
      ...(LEDGER_CORRECTION_ENABLED && canMutate
        ? [{ label: 'Correct...', onClick: () => onViewDebt(item.id) }]
        : []),
      ...(canMutate && canCancelDebt(item.status, item.totalPaid, item.kind)
        ? [
            {
              label: 'Cancel debt',
              onClick: () => onCancelDebt(item),
              tone: 'cancel' as const,
            },
          ]
        : []),
    ];
  }

  return [
    { label: 'View details', onClick: () => onViewPlan(item.id) },
    ...(canMutate && canRecordInstallmentPlanPayment(item.status)
      ? [{ label: 'Record payment', onClick: () => onRecordPlanPayment(item), tone: 'pay' as const }]
      : []),
    ...(LEDGER_CORRECTION_ENABLED && canMutate
      ? [{ label: 'Correct...', onClick: () => onViewPlan(item.id) }]
      : []),
    ...(canMutate && canCancelInstallmentPlan(item.status, item.totalPaid)
      ? [{ label: 'Cancel plan', onClick: () => onCancelPlan(item), tone: 'cancel' as const }]
      : []),
  ];
}

function paymentDescription(item: FinancialLedgerPaymentItem): string {
  if (item.allocations.length === 0) return item.reference || 'Payment';
  return item.allocations
    .map((allocation) => `${allocation.description || 'Unknown target'} ${formatMoney(allocation.amount)}`)
    .join(', ');
}
