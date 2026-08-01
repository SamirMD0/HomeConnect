import { useState, type ReactNode } from 'react';
import { BarChart3, Table2 } from 'lucide-react';
import type { BilingualText } from '../../config/dashboard-labels';
import { BilingualLabel } from '../layout/BilingualLabel';

export interface ChartTableColumn<T> { key: keyof T; label: string; format?: (value: T[keyof T]) => ReactNode }

export function ChartFrame<T extends object>({ title, subtitle, children, rows, columns, height = 280 }: { title: BilingualText; subtitle?: string; children: ReactNode; rows: T[]; columns: Array<ChartTableColumn<T>>; height?: number }) {
  const [view, setView] = useState<'chart' | 'table'>('chart');
  return <div className="viz-root rounded-lg border border-slate-200 bg-white p-3.5"><div className="mb-3 flex items-start justify-between gap-3"><div><h3 className="text-sm font-semibold text-slate-800"><BilingualLabel label={title} compact /></h3>{subtitle && <p className="mt-1 text-xs text-slate-500">{subtitle}</p>}</div><button type="button" onClick={() => setView((current) => current === 'chart' ? 'table' : 'chart')} className="dashboard-icon-button" title={view === 'chart' ? 'View as table' : 'View as chart'} aria-label={view === 'chart' ? 'View as table' : 'View as chart'}>{view === 'chart' ? <Table2 className="h-4 w-4" /> : <BarChart3 className="h-4 w-4" />}</button></div>{view === 'chart' ? <div style={{ height }} className="min-w-0">{children}</div> : <div className="max-h-[280px] overflow-auto"><table className="w-full text-left text-xs"><thead className="sticky top-0 bg-slate-50 text-slate-500"><tr>{columns.map((column) => <th key={String(column.key)} className="px-2 py-2 font-semibold">{column.label}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={index} className="border-t border-slate-100">{columns.map((column) => <td key={String(column.key)} className="px-2 py-2 text-slate-700">{column.format ? column.format(row[column.key]) : String(row[column.key] ?? '—')}</td>)}</tr>)}</tbody></table></div>}</div>;
}

