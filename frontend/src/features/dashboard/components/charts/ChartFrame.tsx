import { useState, type ReactNode } from 'react';
import { BarChart3, Table2 } from 'lucide-react';
import type { BilingualText } from '../../config/dashboard-labels';
import { BilingualLabel } from '../layout/BilingualLabel';
import { ChartViewport } from './ChartViewport';

export interface ChartTableColumn<T> {
  key: keyof T;
  label: string;
  format?: (value: T[keyof T]) => ReactNode;
}

/**
 * Consistent wrapper around every dashboard chart. It sits directly on its
 * chapter's band with no box of its own. Header keeps the bilingual title +
 * optional subtitle and swaps to a scrollable table view on demand for
 * accessibility and copy/paste.
 */
export function ChartFrame<T extends object>({
  title,
  subtitle,
  children,
  rows,
  columns,
  height = 280,
}: {
  title: BilingualText;
  subtitle?: string;
  children: ReactNode;
  rows: T[];
  columns: Array<ChartTableColumn<T>>;
  height?: number;
}) {
  const [view, setView] = useState<'chart' | 'table'>('chart');
  return (
    <div className="viz-root flex min-w-0 flex-col">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-[15px] font-bold tracking-tight text-slate-900">
            <BilingualLabel label={title} compact />
          </h3>
          {subtitle && <p className="mt-0.5 truncate text-xs text-slate-500">{subtitle}</p>}
        </div>
        <button
          type="button"
          onClick={() => setView((current) => (current === 'chart' ? 'table' : 'chart'))}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-500 transition hover:border-brand-200 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/60"
          title={view === 'chart' ? 'View as table' : 'View as chart'}
          aria-label={view === 'chart' ? 'View as table' : 'View as chart'}
        >
          {view === 'chart' ? <Table2 className="h-3.5 w-3.5" /> : <BarChart3 className="h-3.5 w-3.5" />}
        </button>
      </div>
      {view === 'chart' ? (
        <div style={{ height }} className="min-w-0">
          <ChartViewport>{children}</ChartViewport>
        </div>
      ) : (
        <div className="max-h-[280px] overflow-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-slate-100 text-slate-700 font-semibold">
              <tr>
                {columns.map((column) => (
                  <th key={String(column.key)} className="px-2 py-2 font-semibold">
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={index} className="border-t border-slate-100">
                  {columns.map((column) => (
                    <td key={String(column.key)} className="px-2 py-2 text-slate-700">
                      {column.format ? column.format(row[column.key]) : String(row[column.key] ?? '—')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
