import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { formatBusinessDate, formatMoney } from '../../customer-financial/utils/financial-format';
import { ReceivableItem } from '../types/receivables.types';
import { formatDaysAgo, getReceivableTierStyle } from '../utils/receivables-tier';
import { BillsPaidMeter } from './BillsPaidMeter';
import { ReceivableExpandedPanel } from './ReceivableExpandedPanel';
import { StandingChip } from './StandingChip';

interface ReceivableMobileCardProps {
  item: ReceivableItem;
  isExpanded: boolean;
  onToggle: (customerId: string) => void;
  canMutate: boolean;
  onRecordPayment: (item: ReceivableItem) => void;
}

export const ReceivableMobileCard: React.FC<ReceivableMobileCardProps> = ({
  item,
  isExpanded,
  onToggle,
  canMutate,
  onRecordPayment,
}) => {
  const style = getReceivableTierStyle(item.tier);
  const panelId = `receivable-card-panel-${item.customer.id}`;
  const hasOverdue = item.overdueItemCount > 0;

  return (
    <div className={`rounded-lg border border-slate-200 shadow-sm ${style.rowClass} ${style.rowAccentClass}`}>
      <div className="flex items-start justify-between gap-3 p-4">
        <div className="min-w-0">
          <Link
            to={`/customers/${item.customer.id}`}
            dir="auto"
            className={`user-text font-semibold ${style.primaryTextClass} hover:underline`}
          >
            {item.customer.name}
          </Link>
          <p className={`text-xs ${style.mutedTextClass}`}>
            {item.customer.phone}
            {!item.customer.isActive && ' · inactive'}
          </p>
        </div>
        <StandingChip tier={item.tier} reason={item.tierReason} />
      </div>

      <dl className="grid grid-cols-2 gap-3 px-4 pb-3 text-sm">
        <div>
          <dt className={`text-xs ${style.mutedTextClass}`}>Outstanding</dt>
          <dd className={`tabular-nums font-semibold ${style.amountTextClass}`}>
            {formatMoney(item.outstanding)}
          </dd>
        </div>
        <div>
          <dt className={`text-xs ${style.mutedTextClass}`}>Overdue</dt>
          <dd
            className={`tabular-nums font-semibold ${hasOverdue ? 'text-red-800' : style.mutedTextClass}`}
          >
            {hasOverdue ? formatMoney(item.overdueAmount) : '—'}
          </dd>
        </div>
        <div>
          <dt className={`text-xs ${style.mutedTextClass}`}>Bills paid</dt>
          <dd>
            <BillsPaidMeter
              billsPaid={item.billsPaid}
              billsTotal={item.billsTotal}
              paidRatioPercent={item.paidRatioPercent}
            />
          </dd>
        </div>
        <div>
          <dt className={`text-xs ${style.mutedTextClass}`}>Last payment</dt>
          <dd className={style.secondaryTextClass}>
            {item.lastPaymentDate ? (
              <>
                {formatBusinessDate(item.lastPaymentDate)}
                <span className={`block text-xs ${style.mutedTextClass}`}>
                  {formatDaysAgo(item.daysSinceLastPayment)}
                </span>
              </>
            ) : (
              <span className={item.billsTotal > 0 ? 'text-red-800' : style.mutedTextClass}>
                {item.billsTotal > 0 ? 'Never' : '—'}
              </span>
            )}
          </dd>
        </div>
      </dl>

      <div className="flex flex-wrap items-center gap-2 border-t border-white/60 px-4 py-2">
        <button
          type="button"
          aria-expanded={isExpanded}
          aria-controls={panelId}
          onClick={() => onToggle(item.customer.id)}
          className={`inline-flex items-center gap-1 rounded-md px-2 py-2 text-sm font-medium ${style.secondaryTextClass} hover:bg-white/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30`}
        >
          {isExpanded ? (
            <ChevronDown className="h-4 w-4" aria-hidden="true" />
          ) : (
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          )}
          {isExpanded ? 'Hide details' : 'Show details'}
        </button>
        {canMutate && item.outstanding !== '0.00' && (
          <button
            type="button"
            onClick={() => onRecordPayment(item)}
            className="rounded-md px-2 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30"
          >
            Record payment
          </button>
        )}
      </div>

      {isExpanded && (
        <div id={panelId} className="border-t border-slate-100 bg-slate-50/70 px-4 py-4">
          <ReceivableExpandedPanel
            customerId={item.customer.id}
            customerName={item.customer.name}
          />
        </div>
      )}
    </div>
  );
};
