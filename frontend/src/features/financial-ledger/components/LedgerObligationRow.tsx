import React from 'react';
import { ChevronRight } from 'lucide-react';
import { FinancialStatusBadge } from '../../customer-financial/components/FinancialStatusBadge';
import {
  canCancelDebt,
  canCancelInstallmentPlan,
  canRecordDebtPayment,
  canRecordInstallmentPlanPayment,
} from '../../customer-financial/utils/financial-auth';
import { formatBusinessDate, formatDateTime, formatMoney } from '../../customer-financial/utils/financial-format';
import {
  FinancialLedgerDebtItem,
  FinancialLedgerPlanItem,
} from '../types/financial-ledger.types';
import { LEDGER_CORRECTION_ENABLED, LedgerActionItem, LedgerRowActions } from './LedgerRowActions';

interface LedgerObligationRowProps {
  item: FinancialLedgerDebtItem | FinancialLedgerPlanItem;
  isExpanded: boolean;
  childRegionId: string;
  canMutate: boolean;
  openMenuKey: string | null;
  onToggleExpanded: () => void;
  onOpenMenuChange: (menuKey: string | null) => void;
  onViewDebt: (debtId: string) => void;
  onViewPlan: (planId: string) => void;
  onRecordDebtPayment: (debt: FinancialLedgerDebtItem) => void;
  onCancelDebt: (debt: FinancialLedgerDebtItem) => void;
  onRecordPlanPayment: (plan: FinancialLedgerPlanItem) => void;
  onCancelPlan: (plan: FinancialLedgerPlanItem) => void;
}

export const LedgerObligationRow: React.FC<LedgerObligationRowProps> = ({
  item,
  isExpanded,
  childRegionId,
  canMutate,
  openMenuKey,
  onToggleExpanded,
  onOpenMenuChange,
  onViewDebt,
  onViewPlan,
  onRecordDebtPayment,
  onCancelDebt,
  onRecordPlanPayment,
  onCancelPlan,
}) => {
  const isDebt = item.type === 'DEBT';
  const dueDate = isDebt ? item.dueDate : item.nextDueDate;
  const periodSummary = !isDebt ? item.periodSummary : null;
  const amount = isDebt ? item.originalAmount : (periodSummary?.totalDue ?? item.totalAmount);
  const totalPaid = periodSummary?.totalPaid ?? item.totalPaid;
  const remainingBalance = periodSummary?.totalRemaining ?? item.remainingBalance;
  const statusType = isDebt ? 'debt' : 'plan';
  const isOverdue = item.status === 'OVERDUE';
  const openDetails = () => {
    if (isDebt) {
      onViewDebt(item.id);
      return;
    }

    onViewPlan(item.id);
  };
  const actions = buildObligationActions({
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
    <tr className={`h-14 align-middle hover:bg-slate-50 ${isExpanded ? 'bg-slate-50' : 'bg-white'}`}>
      <td className="w-10 px-2 py-3 text-center">
        <button
          type="button"
          aria-expanded={isExpanded}
          aria-controls={childRegionId}
          onClick={onToggleExpanded}
          className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-md text-slate-500 hover:bg-white hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
        >
          <ChevronRight
            className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
            aria-hidden="true"
          />
          <span className="sr-only">
            {isExpanded ? 'Hide' : 'Show'} payments for {item.customer.name} - {item.description}
          </span>
        </button>
      </td>
      <td className={`whitespace-nowrap px-4 py-3 ${isOverdue ? 'font-medium text-red-700' : 'text-slate-600'}`}>
        <p>{formatBusinessDate(dueDate)}</p>
        <p className="text-xs font-normal text-slate-400">Created {formatDateTime(item.createdAt)}</p>
      </td>
      <td className="px-4 py-3">
        <p className="font-medium text-slate-900">{item.customer.name}</p>
        <p className="text-xs text-slate-500">{item.customer.phone}</p>
      </td>
      <td className="hidden px-4 py-3 lg:table-cell">
        <span className="inline-flex rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
          {isDebt
            ? `Debt · ${debtProgressLabel(item)}`
            : periodSummary
              ? `Plan · ${periodSummary.installmentCount} this month`
              : `Plan · ${item.completedInstallmentCount} of ${item.installmentCount}`}
        </span>
      </td>
      <td className="max-w-xs px-4 py-3 text-slate-700">
        <div className="space-y-1">
          <p className="line-clamp-2" title={item.description}>
            {item.description}
          </p>
          {item.correction.hasCorrections && (
            <span className="inline-flex rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700 ring-1 ring-blue-600/20">
              Corrected
            </span>
          )}
        </div>
      </td>
      <MoneyCell value={formatMoney(amount)} weight="medium" />
      <MoneyCell value={formatMoney(totalPaid)} className="hidden xl:table-cell" />
      <MoneyCell value={formatMoney(remainingBalance)} weight="semibold" muteZero />
      <td className="px-4 py-3">
        <FinancialStatusBadge type={statusType} status={item.status} />
      </td>
      <td className="px-4 py-3 text-right">
        <div className="inline-flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              openDetails();
            }}
            className="inline-flex min-h-9 items-center rounded-md border border-slate-200 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 hover:text-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
          >
            View
          </button>
          <LedgerRowActions
            menuKey={`${item.type}-${item.id}`}
            openMenuKey={openMenuKey}
            actions={actions}
            onOpenChange={onOpenMenuChange}
          />
        </div>
      </td>
    </tr>
  );
};

interface BuildObligationActionsArgs {
  item: FinancialLedgerDebtItem | FinancialLedgerPlanItem;
  canMutate: boolean;
  onViewDebt: (debtId: string) => void;
  onViewPlan: (planId: string) => void;
  onRecordDebtPayment: (debt: FinancialLedgerDebtItem) => void;
  onCancelDebt: (debt: FinancialLedgerDebtItem) => void;
  onRecordPlanPayment: (plan: FinancialLedgerPlanItem) => void;
  onCancelPlan: (plan: FinancialLedgerPlanItem) => void;
}

function buildObligationActions({
  item,
  canMutate,
  onViewDebt,
  onViewPlan,
  onRecordDebtPayment,
  onCancelDebt,
  onRecordPlanPayment,
  onCancelPlan,
}: BuildObligationActionsArgs): LedgerActionItem[] {
  if (item.type === 'DEBT') {
    return [
      { label: 'View details', onClick: () => onViewDebt(item.id) },
      ...(canMutate && canRecordDebtPayment(item.status)
        ? [{ label: 'Record payment', onClick: () => onRecordDebtPayment(item), tone: 'pay' as const }]
        : []),
      ...(LEDGER_CORRECTION_ENABLED && canMutate
        ? [{ label: 'Correct...', onClick: () => onViewDebt(item.id) }]
        : []),
      ...(canMutate && canCancelDebt(item.status, item.totalPaid)
        ? [{ label: 'Cancel debt', onClick: () => onCancelDebt(item), tone: 'cancel' as const }]
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

function debtProgressLabel(item: FinancialLedgerDebtItem): string {
  if (item.status === 'PAID') return '1 of 1';
  if (item.status === 'PARTIALLY_PAID') return 'Partial';
  return '0 of 1';
}

export const MoneyCell: React.FC<{
  value: string;
  weight?: 'medium' | 'semibold';
  muteZero?: boolean;
  className?: string;
}> = ({ value, weight, muteZero = false, className = '' }) => {
  const isEmpty = value === '—';
  const isZero = muteZero && (value === '$0.00' || value === '0.00');
  const weightClass = weight === 'semibold' ? 'font-semibold' : weight === 'medium' ? 'font-medium' : '';

  return (
    <td
      className={`px-4 py-3 text-right tabular-nums ${className} ${
        isEmpty || isZero ? 'text-slate-400' : `${weightClass} text-slate-900`
      }`}
    >
      {value}
    </td>
  );
};
