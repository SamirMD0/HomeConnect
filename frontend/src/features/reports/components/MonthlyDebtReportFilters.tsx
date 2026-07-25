import React from 'react';
import { RefreshCw } from 'lucide-react';
import {
  MonthlyDebtReportFilters as MonthlyDebtReportFiltersType,
  MonthlyDebtSortBy,
  MonthlyDebtSortOrder,
} from '../types/monthly-reports.types';

interface MonthlyDebtReportFiltersProps {
  filters: MonthlyDebtReportFiltersType;
  onChange: (filters: MonthlyDebtReportFiltersType) => void;
  onRefresh: () => void;
}

const sortOptions: Array<{ value: MonthlyDebtSortBy; label: string }> = [
  { value: 'OUTSTANDING', label: 'Outstanding' },
  { value: 'OVERDUE', label: 'Overdue' },
  { value: 'CUSTOMER', label: 'Customer' },
  { value: 'LAST_PAYMENT', label: 'Last payment' },
];

export const MonthlyDebtReportFilters: React.FC<MonthlyDebtReportFiltersProps> = ({
  filters,
  onChange,
  onRefresh,
}) => {
  const setFilter = (patch: Partial<MonthlyDebtReportFiltersType>) =>
    onChange({ ...filters, ...patch, page: 1 });

  return (
    <section aria-label="Monthly debt report filters" className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm print:hidden">
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[150px_1fr_180px_140px_180px]">
        <label className="block text-sm font-medium text-slate-700">
          Month
          <input
            type="month"
            value={filters.month}
            onChange={(event) => setFilter({ month: event.target.value })}
            className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Customer search
          <input
            type="search"
            value={filters.search ?? ''}
            onChange={(event) => setFilter({ search: event.target.value || undefined })}
            className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            placeholder="Name or phone"
          />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Sort
          <select
            value={filters.sortBy ?? 'OUTSTANDING'}
            onChange={(event) => setFilter({ sortBy: event.target.value as MonthlyDebtSortBy })}
            className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          >
            {sortOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Direction
          <select
            value={filters.sortOrder ?? 'DESC'}
            onChange={(event) => setFilter({ sortOrder: event.target.value as MonthlyDebtSortOrder })}
            className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          >
            <option value="DESC">Descending</option>
            <option value="ASC">Ascending</option>
          </select>
        </label>
        <button
          type="button"
          onClick={onRefresh}
          className="mt-6 inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>
      <div className="mt-4 flex flex-wrap gap-4">
        <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
          <input
            type="checkbox"
            checked={filters.overdueOnly ?? false}
            onChange={(event) => setFilter({ overdueOnly: event.target.checked })}
            className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
          />
          Show only overdue
        </label>
        <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
          <input
            type="checkbox"
            checked={filters.includeCancelled ?? false}
            onChange={(event) => setFilter({ includeCancelled: event.target.checked })}
            className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
          />
          Include cancelled
        </label>
        <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
          <input
            type="checkbox"
            checked={filters.includeZero ?? false}
            onChange={(event) => setFilter({ includeZero: event.target.checked })}
            className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
          />
          Include zero balances
        </label>
      </div>
    </section>
  );
};
