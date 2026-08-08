import React from 'react';
import { ChevronRight } from 'lucide-react';
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
  FinancialLedgerPlanItem,
} from '../types/financial-ledger.types';
import { LEDGER_CORRECTION_ENABLED, LedgerActionItem, LedgerRowActions } from './LedgerRowActions';
import { LedgerCustomerLink } from './LedgerCustomerLink';

const ledgerCellHover =
  'bg-white transition-all duration-200 group-hover:bg-gray-600 group-hover:text-yellow-300 group-hover:[text-shadow:0_0_8px_rgba(250,204,21,0.8)]';

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
  onEditDebt: (debt: FinancialLedgerDebtItem) => void;
  onEditPlan: (plan: FinancialLedgerPlanItem) => void;
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
  onEditDebt,
  onEditPlan,
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
  // Both fields are optional in practice: a client can outlive the server build that added them.
  const displayStatus = (isDebt ? item.displayStatus : item.status) ?? item.status;
  const saleDeposit = isDebt ? positiveMoneyOrNull(item.saleDepositAmount) : null;
  const isOverdue = item.status === 'OVERDUE';
  const openEdit = () => {
    if (isDebt) {
      onEditDebt(item);
      return;
    }

    onEditPlan(item);
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
    <tr className="group align-middle [filter:drop-shadow(0_1px_1px_rgba(15,23,42,0.05))]">
      <td className={`w-10 rounded-l-md px-2 py-2 text-center ${ledgerCellHover}`}>
        <button
          type="button"
          aria-expanded={isExpanded}
          aria-controls={childRegionId}
          onClick={onToggleExpanded}
          className="inline-flex min-h-8 min-w-8 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-yellow-300 hover:text-slate-950 focus:outline-none focus:ring-2 focus:ring-yellow-300/50 group-hover:text-yellow-300"
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
      <td className={`whitespace-nowrap px-4 py-2 ${ledgerCellHover} ${isOverdue ? 'font-medium text-red-700' : 'text-slate-600'}`}>
        <p>{formatBusinessDate(dueDate)}</p>
        <p className="text-[11px] font-normal text-slate-400 transition-colors group-hover:text-yellow-200">Created {formatDateTime(item.createdAt)}</p>
      </td>
      <td className={`px-4 py-2 ${ledgerCellHover}`}>
        <LedgerCustomerLink customer={item.customer} className="font-medium" />
        <p className="text-[11px] text-slate-500 transition-colors group-hover:text-yellow-200">{item.customer.phone}</p>
      </td>
      <td className={`hidden px-4 py-2 lg:table-cell ${ledgerCellHover}`}>
        <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700 transition-colors group-hover:bg-yellow-300 group-hover:text-slate-950">
          {isDebt
            ? `Debt · ${debtProgressLabel(item)}`
            : periodSummary
              ? `Plan · ${periodSummary.installmentCount} this month`
              : `Plan · ${item.completedInstallmentCount} of ${item.installmentCount}`}
        </span>
      </td>
      <td className={`max-w-xs px-4 py-2 text-slate-700 ${ledgerCellHover}`}>
        <div className="space-y-1">
          <p className="user-text line-clamp-2" dir="auto" title={item.description}>
            {item.description}
          </p>
          {isDebt && saleDeposit && (
            <p className="text-[11px] text-slate-500 transition-colors group-hover:text-yellow-200">
              Deposit at sale: {formatMoney(saleDeposit)}
            </p>
          )}
          {item.correction.hasCorrections && (
            <span className="inline-flex rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700 ring-1 ring-blue-600/20">
              Corrected
            </span>
          )}
        </div>
      </td>
      <MoneyCell value={formatMoney(amount)} weight="medium" />
      <MoneyCell value={formatMoney(totalPaid)} className="hidden xl:table-cell" />
      <MoneyCell
        value={formatMoney(remainingBalance)}
        weight="semibold"
        muteZero
      />
      <td className={`px-4 py-2 ${ledgerCellHover}`}>
        <FinancialStatusBadge type={statusType} status={displayStatus} />
      </td>
      <td className={`rounded-r-md px-4 py-2 text-right ${ledgerCellHover}`}>
        <div className="inline-flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              openEdit();
            }}
            className="inline-flex min-h-8 items-center rounded-md border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-600 transition-all hover:border-yellow-300 hover:bg-gray-600 hover:text-yellow-300 hover:shadow-[0_0_12px_rgba(250,204,21,0.4)] focus:outline-none focus:ring-2 focus:ring-yellow-300/50"
          >
            Edit
          </button>
          <LedgerRowActions
            menuKey={`desktop-${item.type}-${item.id}`}
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

function debtProgressLabel(item: FinancialLedgerDebtItem): string {
  const status = item.displayStatus ?? item.status;
  if (status === 'PAID') return '1 of 1';
  if (status === 'PARTIALLY_PAID') return 'Partial';
  return '0 of 1';
}

export const MoneyCell: React.FC<{
  value: string;
  weight?: 'medium' | 'semibold';
  muteZero?: boolean;
  className?: string;
  tone?: 'default' | 'liability';
}> = ({ value, weight, muteZero = false, className = '', tone = 'default' }) => {
  const isEmpty = value === '—';
  const isZero = muteZero && (value === '$0.00' || value === '0.00');
  const weightClass = weight === 'semibold' ? 'font-semibold' : weight === 'medium' ? 'font-medium' : '';

  return (
    <td
      className={`bg-white px-4 py-2 text-right tabular-nums transition-all duration-200 group-hover:bg-gray-600 group-hover:text-yellow-300 group-hover:[text-shadow:0_0_8px_rgba(250,204,21,0.8)] ${className} ${
        isEmpty || isZero
          ? 'text-slate-400'
          : `${weightClass} ${tone === 'liability' ? 'text-red-700' : 'text-slate-900'}`
      }`}
    >
      {value}
    </td>
  );
};
