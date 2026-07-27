import React, { useState } from 'react';
import {
  FinancialLedgerFilters,
  FinancialLedgerStatusFilter,
  FinancialLedgerTypeFilter,
} from '../types/financial-ledger.types';
import { ledgerStatusLabels, ledgerTypeLabels } from '../utils/ledger-labels';

interface LedgerFiltersProps {
  filters: FinancialLedgerFilters;
  onChange: (filters: FinancialLedgerFilters) => void;
}

const typeFilters: FinancialLedgerTypeFilter[] = [
  'ALL',
  'DEBT',
  'INSTALLMENT_PLAN',
  'PAYMENT',
  'OVERDUE',
];
const statusFilters: FinancialLedgerStatusFilter[] = [
  'ACTIVE',
  'OVERDUE',
  'PAID_COMPLETED',
  'CANCELLED',
];

const advancedFilterKeys: Array<keyof FinancialLedgerFilters> = [
  'status',
  'dueFrom',
  'includeCancelled',
  'correctedOnly',
];

export function hasActiveLedgerFilters(filters: FinancialLedgerFilters): boolean {
  return Boolean(
    (filters.type && filters.type !== 'ALL') ||
      filters.status ||
      filters.search ||
      filters.dueFrom ||
      filters.dueTo ||
      filters.paymentFrom ||
      filters.paymentTo ||
      filters.includeCancelled ||
      filters.includeCompleted ||
      filters.correctedOnly
  );
}

export function countActiveAdvancedLedgerFilters(filters: FinancialLedgerFilters): number {
  return advancedFilterKeys.reduce((count, key) => {
    const value = filters[key];
    return value === undefined || value === false || value === '' ? count : count + 1;
  }, 0);
}

export function resetLedgerFilters(filters: FinancialLedgerFilters): FinancialLedgerFilters {
  return {
    ...filters,
    type: 'ALL',
    status: undefined,
    search: undefined,
    dueFrom: undefined,
    dueTo: undefined,
    paymentFrom: undefined,
    paymentTo: undefined,
    includeCancelled: false,
    includeCompleted: false,
    correctedOnly: false,
    page: 1,
  };
}

export function applyLedgerStatusFilter(
  filters: FinancialLedgerFilters,
  status: FinancialLedgerStatusFilter | undefined
): FinancialLedgerFilters {
  return {
    ...filters,
    status,
    includeCancelled: status === 'CANCELLED' ? true : filters.includeCancelled,
    page: 1,
  };
}

export function getLedgerMonthFilterValue(filters: FinancialLedgerFilters): string {
  if (!filters.dueFrom || !filters.dueTo || !filters.paymentFrom || !filters.paymentTo) return '';
  const month = filters.dueFrom.slice(0, 7);
  const range = ledgerMonthRange(month);
  return filters.dueFrom === range.from &&
    filters.dueTo === range.to &&
    filters.paymentFrom === range.from &&
    filters.paymentTo === range.to
    ? month
    : '';
}

export function applyLedgerMonthFilter(filters: FinancialLedgerFilters, month: string): FinancialLedgerFilters {
  if (!month) {
    return {
      ...filters,
      dueFrom: undefined,
      dueTo: undefined,
      paymentFrom: undefined,
      paymentTo: undefined,
      page: 1,
    };
  }

  const range = ledgerMonthRange(month);
  return {
    ...filters,
    dueFrom: range.from,
    dueTo: range.to,
    paymentFrom: range.from,
    paymentTo: range.to,
    page: 1,
  };
}

function ledgerMonthRange(month: string): { from: string; to: string } {
  const [yearPart, monthPart] = month.split('-');
  const year = Number(yearPart);
  const monthNumber = Number(monthPart);
  const lastDay = new Date(year, monthNumber, 0).getDate();
  return {
    from: `${month}-01`,
    to: `${month}-${String(lastDay).padStart(2, '0')}`,
  };
}

export const LedgerFilters: React.FC<LedgerFiltersProps> = ({ filters, onChange }) => {
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const setFilter = (patch: FinancialLedgerFilters) => onChange({ ...filters, ...patch, page: 1 });
  const activeAdvancedFilterCount = countActiveAdvancedLedgerFilters(filters);
  const hasActiveFilters = hasActiveLedgerFilters(filters);
  const selectedMonth = getLedgerMonthFilterValue(filters);

  return (
    <section aria-label="Ledger filters" className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="space-y-5">
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[auto_minmax(220px,1fr)_280px_auto] xl:items-end">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Ledger view</p>
            <div className="flex flex-wrap gap-2" role="tablist" aria-label="Ledger type">
              {typeFilters.map((type) => (
                <button
                  key={type}
                  type="button"
                  role="tab"
                  aria-selected={(filters.type ?? 'ALL') === type}
                  onClick={() => setFilter({ type })}
                  className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    (filters.type ?? 'ALL') === type
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {ledgerTypeLabels[type]}
                </button>
              ))}
            </div>
          </div>

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

          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <label className="inline-flex items-start gap-2 text-sm font-medium text-slate-800">
              <input
                type="checkbox"
                checked={filters.includeCompleted ?? false}
                onChange={(event) => setFilter({ includeCompleted: event.target.checked })}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
              />
              <span>
                Include completed
                <span className="block text-xs font-normal text-slate-500">
                  Paid debts and completed plans are hidden by default.
                </span>
              </span>
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-2 xl:justify-end">
            <button
              type="button"
              onClick={() => setShowAdvancedFilters((value) => !value)}
              aria-expanded={showAdvancedFilters}
              aria-controls="ledger-advanced-filters"
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            >
              More filters{activeAdvancedFilterCount > 0 ? ` (${activeAdvancedFilterCount})` : ''}
            </button>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={() => onChange(resetLedgerFilters(filters))}
                className="rounded-lg px-3 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              >
                Clear filters
              </button>
            )}
          </div>
        </div>

        {showAdvancedFilters && (
          <div
            id="ledger-advanced-filters"
            className="grid grid-cols-1 gap-3 border-t border-slate-100 pt-4 md:grid-cols-2 xl:grid-cols-[180px_180px_190px]"
          >
            <label className="block text-sm font-medium text-slate-700">
              Status
              <select
                value={filters.status ?? ''}
                onChange={(event) =>
                  onChange(
                    applyLedgerStatusFilter(
                      filters,
                      (event.target.value || undefined) as FinancialLedgerStatusFilter | undefined
                    )
                  )
                }
                className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              >
                <option value="">Any status</option>
                {statusFilters.map((status) => (
                  <option key={status} value={status}>
                    {ledgerStatusLabels[status]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Month
              <input
                type="month"
                value={selectedMonth}
                onChange={(event) => onChange(applyLedgerMonthFilter(filters, event.target.value))}
                className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
              <span className="mt-1 block text-xs font-normal text-slate-500">
                Applies to due dates and payment dates.
              </span>
            </label>
            <div className="space-y-2 md:col-span-2 xl:col-span-1 xl:pt-7">
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
                  checked={filters.correctedOnly ?? false}
                  onChange={(event) => setFilter({ correctedOnly: event.target.checked })}
                  className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
                Corrected records
              </label>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};
