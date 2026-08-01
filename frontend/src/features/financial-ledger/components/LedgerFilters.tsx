import React, { useState } from 'react';
import {
  FinancialLedgerFilters,
  FinancialLedgerStatusFilter,
  FinancialLedgerTypeFilter,
} from '../types/financial-ledger.types';
import { ledgerStatusLabels, ledgerTypeLabels } from '../utils/ledger-labels';
import { businessLabels } from '../../../shared/labels/business-labels';

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
    <section aria-label="Ledger filters" className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <div className="space-y-3">
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(360px,1fr)_260px_250px_auto] xl:items-end">
          <div className="min-w-0">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{businessLabels.ledger.view}</p>
            <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Ledger type">
              {typeFilters.map((type) => (
                <button
                  key={type}
                  type="button"
                  role="tab"
                  aria-selected={(filters.type ?? 'ALL') === type}
                  onClick={() => setFilter({ type })}
                  className={`rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors ${
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

          <label className="block text-xs font-semibold text-slate-700">
            {businessLabels.ledger.customerSearch}
            <input
              type="search"
              value={filters.search ?? ''}
              onChange={(event) => setFilter({ search: event.target.value || undefined })}
              className="mt-1 block h-9 w-full rounded-md border border-slate-300 px-3 text-sm font-normal focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              placeholder="Name or phone / الاسم أو الهاتف"
            />
          </label>

          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
            <label className="inline-flex items-start gap-2 text-xs font-semibold text-slate-800">
              <input
                type="checkbox"
                checked={filters.includeCompleted ?? false}
                onChange={(event) => setFilter({ includeCompleted: event.target.checked })}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
              />
              <span>
                {businessLabels.ledger.includeCompleted}
                <span className="block text-[11px] font-normal leading-snug text-slate-500">
                  Hidden by default / مخفي افتراضياً
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
              className="rounded-md border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            >
              More Filters{activeAdvancedFilterCount > 0 ? ` (${activeAdvancedFilterCount})` : ''}
            </button>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={() => onChange(resetLedgerFilters(filters))}
                className="rounded-md px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {showAdvancedFilters && (
          <div
            id="ledger-advanced-filters"
            className="grid grid-cols-1 gap-3 border-t border-slate-100 pt-3 md:grid-cols-2 xl:grid-cols-[170px_170px_190px]"
          >
            <label className="block text-xs font-semibold text-slate-700">
              {businessLabels.common.status}
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
                className="mt-1 block h-9 w-full rounded-md border border-slate-300 px-3 text-sm font-normal focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              >
                <option value="">Any Status / أي حالة</option>
                {statusFilters.map((status) => (
                  <option key={status} value={status}>
                    {ledgerStatusLabels[status]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-semibold text-slate-700">
              Month / الشهر
              <input
                type="month"
                value={selectedMonth}
                onChange={(event) => onChange(applyLedgerMonthFilter(filters, event.target.value))}
                className="mt-1 block h-9 w-full rounded-md border border-slate-300 px-3 text-sm font-normal focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
              <span className="mt-1 block text-[11px] font-normal leading-snug text-slate-500">
                Applies to due dates and payment dates.
              </span>
            </label>
            <div className="space-y-2 md:col-span-2 xl:col-span-1 xl:pt-6">
              <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={filters.includeCancelled ?? false}
                  onChange={(event) => setFilter({ includeCancelled: event.target.checked })}
                  className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
                {businessLabels.ledger.includeCancelled}
              </label>
              <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={filters.correctedOnly ?? false}
                  onChange={(event) => setFilter({ correctedOnly: event.target.checked })}
                  className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
                Corrected Records / السجلات المصححة
              </label>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};
