import React from 'react';
import { FinancialLedgerPaymentItem } from '../types/financial-ledger.types';
import { formatBusinessDate, formatDateTime, formatMoney } from '../../customer-financial/utils/financial-format';
import { LedgerRowActions } from './LedgerRowActions';
import { MoneyCell } from './LedgerObligationRow';

interface LedgerPaymentRowProps {
  item: FinancialLedgerPaymentItem;
  canMutate: boolean;
  openMenuKey: string | null;
  onOpenMenuChange: (menuKey: string | null) => void;
  onVoidPayment: (payment: FinancialLedgerPaymentItem) => void;
}

export const LedgerPaymentRow: React.FC<LedgerPaymentRowProps> = ({
  item,
  canMutate,
  openMenuKey,
  onOpenMenuChange,
  onVoidPayment,
}) => (
  <tr className="group align-middle [filter:drop-shadow(0_1px_1px_rgba(15,23,42,0.05))]">
    <td className="w-10 rounded-l-md bg-white px-2 py-2 transition-all duration-200 group-hover:bg-gray-600" />
    <td className="whitespace-nowrap bg-white px-4 py-2 text-slate-600 transition-all duration-200 group-hover:bg-gray-600 group-hover:text-yellow-300 group-hover:[text-shadow:0_0_8px_rgba(250,204,21,0.8)]">
      <p>{formatBusinessDate(item.paymentDate)}</p>
      <p className="text-[11px] text-slate-400 transition-colors group-hover:text-yellow-200">Created {formatDateTime(item.createdAt)}</p>
    </td>
    <td className="bg-white px-4 py-2 transition-all duration-200 group-hover:bg-gray-600 group-hover:text-yellow-300">
      <p className="user-text font-medium text-slate-900 transition-colors group-hover:text-yellow-300" dir="auto">{item.customer.name}</p>
      <p className="text-[11px] text-slate-500 transition-colors group-hover:text-yellow-200">{item.customer.phone}</p>
    </td>
    <td className="hidden bg-white px-4 py-2 transition-all duration-200 group-hover:bg-gray-600 lg:table-cell">
      <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700 transition-colors group-hover:bg-yellow-300 group-hover:text-slate-950">
        {paymentTypeLabel(item)}
      </span>
    </td>
    <td className="max-w-xs bg-white px-4 py-2 text-slate-700 transition-all duration-200 group-hover:bg-gray-600 group-hover:text-yellow-300 group-hover:[text-shadow:0_0_8px_rgba(250,204,21,0.8)]">
      <div className="space-y-1">
        <p className="user-text line-clamp-2" dir="auto" title={allocationSummary(item)}>
          {allocationSummary(item)}
        </p>
        {item.correction.hasCorrections && (
          <span className="inline-flex rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700 ring-1 ring-blue-600/20">
            Corrected
          </span>
        )}
      </div>
    </td>
    <MoneyCell value={formatMoney(item.amount)} weight="medium" />
    <MoneyCell value="—" className="hidden xl:table-cell" />
    <MoneyCell value="—" />
    <td className="bg-white px-4 py-2 transition-all duration-200 group-hover:bg-gray-600">
      <span
        className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ring-1 ${
          item.status === 'VOIDED'
            ? 'bg-amber-50 text-amber-700 ring-amber-600/20'
            : 'bg-emerald-50 text-emerald-700 ring-emerald-600/20'
        }`}
      >
        {item.status === 'VOIDED' ? 'Voided' : 'Completed'}
      </span>
    </td>
    <td className="rounded-r-md bg-white px-4 py-2 text-right transition-all duration-200 group-hover:bg-gray-600 group-hover:text-yellow-300">
      <LedgerRowActions
        menuKey={`${item.type}-${item.id}`}
        openMenuKey={openMenuKey}
        actions={
          canMutate && item.status !== 'VOIDED'
            ? [{ label: 'Void payment', onClick: () => onVoidPayment(item), tone: 'cancel' }]
            : []
        }
        immutableHint="Immutable"
        onOpenChange={onOpenMenuChange}
      />
    </td>
  </tr>
);

function allocationSummary(item: FinancialLedgerPaymentItem): string {
  if (item.allocations.length === 0) return item.reference || 'Payment';
  return item.allocations
    .map((allocation) => `${allocation.description || 'Unknown target'} ${formatMoney(allocation.amount)}`)
    .join(', ');
}

function paymentTypeLabel(item: FinancialLedgerPaymentItem): string {
  if (item.allocations.length === 0) return 'Payment';
  const targetTypes = new Set(item.allocations.map((allocation) => allocation.targetType));
  if (targetTypes.size === 1 && targetTypes.has('INSTALLMENT')) return 'Installment Payment';
  if (targetTypes.size === 1 && targetTypes.has('DEBT')) return 'Debt Payment';
  return 'Mixed Payment';
}
