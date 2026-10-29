import React from 'react';
import { Building2 } from 'lucide-react';
import { cn } from '../../../lib/cn';

/** Branch identity the backend adds to every breakdown row (3C `withBranchBreakdown`). */
export interface BranchIdentity {
  branchId: string;
  branchCode: string;
  branchName: string;
}

/** An aggregate figure set plus, in multi-branch scope, the same figures per branch. */
export type WithBranchBreakdown<T> = T & { branchBreakdown?: Array<T & BranchIdentity> };

export interface BreakdownMetric<T> {
  label: string;
  value: (figures: T) => React.ReactNode;
  /** Money and counts read best right-aligned. */
  numeric?: boolean;
}

export interface BranchBreakdownTableProps<T> {
  title: string;
  description?: string;
  /** The total row: the full-scope figures exactly as the server calculated them. */
  total: T;
  rows: Array<T & BranchIdentity> | undefined;
  metrics: BreakdownMetric<T>[];
}

/**
 * "By branch" comparison. The server returns a breakdown only when the scope
 * covers two or more branches, so this renders nothing otherwise. The total row
 * is the server's own total — never a sum computed here — and the rows add up
 * to it because each is the same calculation for one branch.
 */
export function BranchBreakdownTable<T>({ title, description, total, rows, metrics }: BranchBreakdownTableProps<T>) {
  if (!rows || rows.length < 2) return null;
  return (
    <section className="rounded-xl border border-border bg-white" data-testid="branch-breakdown">
      <header className="flex items-start gap-3 border-b border-border px-5 py-4">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700" aria-hidden="true">
          <Building2 className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
          {description && <p className="mt-0.5 text-xs text-slate-500">{description}</p>}
        </div>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs font-medium text-slate-500">
            <tr>
              <th scope="col" className="px-5 py-2.5 font-medium">Branch / الفرع</th>
              {metrics.map((metric) => (
                <th key={metric.label} scope="col" className={cn('whitespace-nowrap px-5 py-2.5 font-medium', metric.numeric && 'text-right')}>
                  {metric.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => (
              <tr key={row.branchId}>
                <th scope="row" className="px-5 py-2.5 font-normal">
                  <span className="inline-flex items-center gap-2">
                    <span className="rounded bg-brand-600 px-1 text-[10px] font-bold uppercase text-white">{row.branchCode.slice(0, 4)}</span>
                    <span className="user-text font-medium text-slate-800" dir="auto">{row.branchName}</span>
                  </span>
                </th>
                {metrics.map((metric) => (
                  <td key={metric.label} className={cn('px-5 py-2.5 text-slate-700', metric.numeric && 'text-right tabular-nums')}>
                    {metric.value(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t border-border bg-slate-50/60">
            <tr>
              <th scope="row" className="px-5 py-2.5 font-semibold text-slate-900">All branches</th>
              {metrics.map((metric) => (
                <td key={metric.label} className={cn('px-5 py-2.5 font-semibold text-slate-900', metric.numeric && 'text-right tabular-nums')}>
                  {metric.value(total)}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}
