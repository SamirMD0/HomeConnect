import React from 'react';
import { Link } from 'react-router-dom';
import { Printer } from 'lucide-react';
import { buttonClasses, Card, EmptyState, SkeletonTable } from '../../../components/ui';
import { formatBusinessDate, formatMoney } from '../../customer-financial/utils/financial-format';
import { cn } from '../../../lib/cn';

export interface StatementRow {
  id: string;
  date: string;
  type: string;
  description: string;
  reference: string | null;
  debit: string | null;
  credit: string | null;
  balance: string;
  /** Set when the entry was voided, cancelled or removed: shown, but moves nothing. */
  inactiveLabel: string | null;
  reason: string | null;
}

export interface StatementTableProps {
  title: React.ReactNode;
  /** One line saying what debit, credit and the balance mean for this party. */
  explanation: string;
  from: string;
  to: string;
  onRangeChange: (range: { from: string; to: string }) => void;
  printHref: string;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  openingBalance?: string;
  closingBalance?: string;
  rows?: StatementRow[];
}

function BalanceRow({ label, value }: { label: string; value: string }) {
  return (
    <tr className="bg-slate-100 font-semibold text-slate-900">
      <td colSpan={5} className="px-4 py-2.5">{label}</td>
      <td className="px-4 py-2.5 text-right tabular-nums">{formatMoney(value)}</td>
    </tr>
  );
}

/** Statement of account on screen: opening balance, each entry, closing balance. */
export const StatementTable: React.FC<StatementTableProps> = ({
  title,
  explanation,
  from,
  to,
  onRangeChange,
  printHref,
  isLoading,
  isError,
  onRetry,
  openingBalance,
  closingBalance,
  rows,
}) => (
  <Card variant="flush">
    <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 p-4">
      <div className="min-w-0">
        <h2 className="text-lg font-bold tracking-tight text-slate-900">{title}</h2>
        <p className="mt-0.5 text-sm text-slate-600">{explanation}</p>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs font-semibold text-slate-600">
          From
          <input
            type="date"
            value={from}
            max={to}
            onChange={(event) => event.target.value && onRangeChange({ from: event.target.value, to })}
            className="mt-1 block h-9 rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-900"
          />
        </label>
        <label className="text-xs font-semibold text-slate-600">
          To
          <input
            type="date"
            value={to}
            min={from}
            onChange={(event) => event.target.value && onRangeChange({ from, to: event.target.value })}
            className="mt-1 block h-9 rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-900"
          />
        </label>
        <Link to={printHref} className={buttonClasses('secondary')}>
          <Printer className="h-4 w-4" aria-hidden="true" />
          Print
        </Link>
      </div>
    </div>

    {isLoading && <div className="p-4"><SkeletonTable /></div>}
    {isError && (
      <div className="p-4">
        <div className="dashboard-state">
          <p>Unable to load this statement.</p>
          <button type="button" onClick={onRetry}>Retry</button>
        </div>
      </div>
    )}
    {!isLoading && !isError && rows && openingBalance !== undefined && closingBalance !== undefined && (
      <div className="overflow-x-auto">
        <table className="w-full min-w-[44rem] text-left text-sm text-slate-700">
          <thead className="border-b border-slate-200 bg-slate-100 text-xs font-semibold text-slate-700">
            <tr>
              <th className="px-4 py-2.5 whitespace-nowrap">Date</th>
              <th className="px-4 py-2.5">Entry</th>
              <th className="px-4 py-2.5">Reference</th>
              <th className="px-4 py-2.5 text-right">Debit</th>
              <th className="px-4 py-2.5 text-right">Credit</th>
              <th className="px-4 py-2.5 text-right">Balance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200/70">
            <BalanceRow label={`Opening balance on ${formatBusinessDate(from)}`} value={openingBalance} />
            {rows.map((row) => (
              <tr key={row.id} className={cn(row.inactiveLabel && 'text-slate-500')}>
                <td className="px-4 py-2.5 whitespace-nowrap">{formatBusinessDate(row.date)}</td>
                <td className="px-4 py-2.5">
                  <span className="font-semibold">{row.type}</span>
                  {row.inactiveLabel && (
                    <span className="ml-2 rounded-full bg-slate-500/10 px-2 py-0.5 text-[11px] font-semibold">{row.inactiveLabel}</span>
                  )}
                  <span className="user-text block text-xs text-slate-600" dir="auto">{row.description}</span>
                  {row.reason && <span className="user-text block text-xs text-slate-500" dir="auto">{row.reason}</span>}
                </td>
                <td className="px-4 py-2.5">{row.reference ?? '—'}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{row.debit ? formatMoney(row.debit) : '—'}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{row.credit ? formatMoney(row.credit) : '—'}</td>
                <td className="px-4 py-2.5 text-right font-semibold tabular-nums">{formatMoney(row.balance)}</td>
              </tr>
            ))}
            <BalanceRow label={`Closing balance on ${formatBusinessDate(to)}`} value={closingBalance} />
          </tbody>
        </table>
        {rows.length === 0 && <EmptyState title="No entries in this period" description="Choose a wider date range to see more." />}
      </div>
    )}
  </Card>
);

/** Year to date, the same default as the printed statements. */
export function defaultStatementRange(today = new Date().toISOString().slice(0, 10)) {
  return { from: `${today.slice(0, 4)}-01-01`, to: today };
}

/** Splits a signed balance effect into a column; the sign itself is never shown. */
export function splitEffect(effect: string, positiveColumn: 'debit' | 'credit'): Pick<StatementRow, 'debit' | 'credit'> {
  const value = Number(effect);
  if (value === 0) return { debit: null, credit: null };
  const amount = effect.replace('-', '');
  const column = value > 0 ? positiveColumn : positiveColumn === 'debit' ? 'credit' : 'debit';
  return column === 'debit' ? { debit: amount, credit: null } : { debit: null, credit: amount };
}
