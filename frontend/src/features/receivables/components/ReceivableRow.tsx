import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { formatBusinessDate, formatMoney } from '../../customer-financial/utils/financial-format';
import { LedgerActionItem, LedgerRowActions } from '../../financial-ledger/components/LedgerRowActions';
import { ReceivableItem } from '../types/receivables.types';
import { formatDaysAgo, getReceivableTierStyle } from '../utils/receivables-tier';
import { BillsPaidMeter } from './BillsPaidMeter';
import { ReceivableExpandedPanel } from './ReceivableExpandedPanel';
import { StandingChip } from './StandingChip';

export const RECEIVABLE_COLUMN_COUNT = 9;

interface ReceivableRowProps {
  item: ReceivableItem;
  isExpanded: boolean;
  onToggle: (customerId: string) => void;
  canMutate: boolean;
  onRecordPayment: (item: ReceivableItem) => void;
  openMenuKey: string | null;
  onOpenMenuChange: (menuKey: string | null) => void;
}

export const ReceivableRow: React.FC<ReceivableRowProps> = ({
  item,
  isExpanded,
  onToggle,
  canMutate,
  onRecordPayment,
  openMenuKey,
  onOpenMenuChange,
}) => {
  const style = getReceivableTierStyle(item.tier);
  const panelId = `receivable-panel-${item.customer.id}`;
  const hasOverdue = item.overdueItemCount > 0;
  const actions: LedgerActionItem[] = [
    { label: 'View details', onClick: () => onToggle(item.customer.id), tone: 'view' },
    ...(canMutate && item.outstanding !== '0.00'
      ? [{ label: 'Record payment', onClick: () => onRecordPayment(item), tone: 'pay' as const }]
      : []),
  ];

  return (
    <>
      <tr className={`transition-colors ${style.rowClass} ${style.rowHoverClass} ${style.rowAccentClass}`}>
        <td className="px-2 py-3 align-middle">
          <button
            type="button"
            aria-expanded={isExpanded}
            aria-controls={panelId}
            onClick={() => onToggle(item.customer.id)}
            className={`inline-flex h-9 w-9 items-center justify-center rounded-md ${style.secondaryTextClass} hover:bg-white/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30`}
          >
            {isExpanded ? (
              <ChevronDown className="h-4 w-4" aria-hidden="true" />
            ) : (
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            )}
            <span className="sr-only">
              {isExpanded ? 'Hide details for' : 'Show details for'} {item.customer.name}
            </span>
          </button>
        </td>

        <td className="px-3 py-3 align-middle">
          <Link
            to={`/customers/${item.customer.id}`}
            dir="auto"
            className={`user-text font-medium ${style.primaryTextClass} hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30`}
          >
            {item.customer.name}
          </Link>
          <p className={`text-xs ${style.mutedTextClass}`}>
            {item.customer.phone}
            {!item.customer.isActive && ' · inactive'}
          </p>
        </td>

        <td className="px-3 py-3 align-middle">
          <StandingChip tier={item.tier} reason={item.tierReason} />
        </td>

        <td className={`px-3 py-3 text-right align-middle tabular-nums font-medium ${style.amountTextClass}`}>
          {formatMoney(item.outstanding)}
        </td>

        <td
          className={`px-3 py-3 text-right align-middle tabular-nums ${hasOverdue ? 'font-medium text-red-800' : style.mutedTextClass}`}
        >
          {hasOverdue ? formatMoney(item.overdueAmount) : '—'}
        </td>

        <td className="px-3 py-3 align-middle">
          <BillsPaidMeter
            billsPaid={item.billsPaid}
            billsTotal={item.billsTotal}
            paidRatioPercent={item.paidRatioPercent}
          />
        </td>

        <td className="px-3 py-3 align-middle">
          {item.lastPaymentDate ? (
            <>
              <span className={`block ${style.secondaryTextClass}`}>
                {formatBusinessDate(item.lastPaymentDate)}
              </span>
              <span className={`text-xs ${style.mutedTextClass}`}>
                {formatDaysAgo(item.daysSinceLastPayment)}
              </span>
            </>
          ) : (
            <span className={item.billsTotal > 0 ? 'text-red-800' : style.mutedTextClass}>
              {item.billsTotal > 0 ? 'Never' : '—'}
            </span>
          )}
        </td>

        <td className={`hidden px-3 py-3 align-middle ${style.secondaryTextClass} lg:table-cell`}>
          {item.nextDueDate ? formatBusinessDate(item.nextDueDate) : <span className={style.mutedTextClass}>—</span>}
        </td>

        <td className="px-2 py-3 text-right align-middle">
          <LedgerRowActions
            menuKey={`receivable-${item.customer.id}`}
            openMenuKey={openMenuKey}
            actions={actions}
            onOpenChange={onOpenMenuChange}
          />
        </td>
      </tr>

      {isExpanded && (
        <tr id={panelId} className="bg-slate-50/70">
          <td colSpan={RECEIVABLE_COLUMN_COUNT} className="border-l-2 border-l-slate-200 px-6 py-4">
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.15 }}
            >
              <ReceivableExpandedPanel
                customerId={item.customer.id}
                customerName={item.customer.name}
              />
            </motion.div>
          </td>
        </tr>
      )}
    </>
  );
};
