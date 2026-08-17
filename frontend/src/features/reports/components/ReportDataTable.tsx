import { formatMoney } from '../../customer-financial/utils/financial-format';
import type { ReportRow } from '../types/report-rows.types';
import { columnsFor, rowKey, summariesFor, type ReportColumn, type ReportSummaryItem } from './report-columns';
import type { ReportSlice } from '../types/report-rows.types';

/**
 * The report body: totals first, then the full table.
 *
 * Sized to be read as a document rather than glanced at in a dashboard card —
 * larger type, taller rows, a header that stays put while scrolling, and no
 * artificial width cap. Wide reports scroll inside their own container so the
 * page itself never scrolls sideways.
 */
export function ReportTotals({ items }: { items: ReportSummaryItem[] }) {
  if (items.length === 0) return null;
  return (
    <section aria-label="Report totals" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{item.label}</p>
          <strong className="mt-2 block text-2xl text-slate-900">
            {item.money ? formatMoney(item.value) : item.value}
          </strong>
        </div>
      ))}
    </section>
  );
}

export function ReportDataTable({ slice, rows }: { slice: ReportSlice; rows: ReportRow[] }) {
  const columns = columnsFor(slice);
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 z-10 bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
            <tr>
              {columns.map((column) => (
                <th key={column.label} scope="col" className={`whitespace-nowrap px-4 py-3.5 font-semibold ${alignment(column)}`}>
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row, index) => (
              <tr key={rowKey(row, index)} className="align-top odd:bg-white even:bg-slate-50/40">
                {columns.map((column) => (
                  <td key={column.label} className={`px-4 py-3.5 text-slate-700 ${alignment(column)}`}>
                    {column.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
        {rows.length} row{rows.length === 1 ? '' : 's'} / {rows.length} سجل
      </p>
    </section>
  );
}

export { summariesFor };

function alignment(column: ReportColumn) {
  return column.numeric ? 'text-right' : 'text-left';
}
