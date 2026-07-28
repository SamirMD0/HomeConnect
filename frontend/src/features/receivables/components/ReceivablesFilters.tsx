import React, { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { ReceivableFilters, ReceivableTier, ReceivableTierCounts } from '../types/receivables.types';
import { hasActiveReceivableFilters } from '../utils/receivables-query';
import { getReceivableTierStyle, receivableTierOrder } from '../utils/receivables-tier';

interface ReceivablesFiltersProps {
  filters: ReceivableFilters;
  tierCounts: ReceivableTierCounts;
  onChange: (filters: ReceivableFilters) => void;
}

const SEARCH_DEBOUNCE_MS = 300;

export function resetReceivableFilters(filters: ReceivableFilters): ReceivableFilters {
  return {
    ...filters,
    search: undefined,
    month: undefined,
    tier: [],
    onlyWithBalance: false,
    includeInactive: false,
    page: 1,
  };
}

export const ReceivablesFilters: React.FC<ReceivablesFiltersProps> = ({
  filters,
  tierCounts,
  onChange,
}) => {
  const [searchDraft, setSearchDraft] = useState(filters.search ?? '');
  const activeTiers = filters.tier ?? [];
  const setFilter = (patch: ReceivableFilters) => onChange({ ...filters, ...patch, page: 1 });

  // Keep the input in sync when filters are cleared from outside this component.
  useEffect(() => {
    setSearchDraft(filters.search ?? '');
  }, [filters.search]);

  useEffect(() => {
    if (searchDraft === (filters.search ?? '')) return;

    const timeout = window.setTimeout(() => {
      onChange({ ...filters, search: searchDraft || undefined, page: 1 });
    }, SEARCH_DEBOUNCE_MS);

    return () => window.clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchDraft]);

  const toggleTier = (tier: ReceivableTier) => {
    const next = activeTiers.includes(tier)
      ? activeTiers.filter((value) => value !== tier)
      : [...activeTiers, tier];
    setFilter({ tier: next });
  };

  return (
    <section
      aria-label="Accounts receivable filters"
      className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
    >
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(220px,1fr)_190px_auto] xl:items-end">
        <label className="block text-sm font-medium text-slate-700">
          Customer search
          <span className="relative mt-1 block">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            />
            <input
              type="search"
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
              placeholder="Name or phone"
              className="block w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
          </span>
        </label>

        <label className="block text-sm font-medium text-slate-700">
          Month
          <input
            type="month"
            value={filters.month ?? ''}
            onChange={(event) => setFilter({ month: event.target.value || undefined })}
            className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          />
        </label>

        <div className="flex flex-wrap items-center gap-4">
          <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
            <input
              type="checkbox"
              checked={filters.onlyWithBalance ?? false}
              onChange={(event) => setFilter({ onlyWithBalance: event.target.checked })}
              className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
            />
            Only customers with a balance
          </label>
          <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
            <input
              type="checkbox"
              checked={filters.includeInactive ?? false}
              onChange={(event) => setFilter({ includeInactive: event.target.checked })}
              className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
            />
            Include inactive customers
          </label>
          {hasActiveReceivableFilters(filters) && (
            <button
              type="button"
              onClick={() => onChange(resetReceivableFilters(filters))}
              className="rounded-lg px-3 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/20"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      <div className="mt-4 border-t border-slate-100 pt-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Standing</p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            aria-pressed={activeTiers.length === 0}
            onClick={() => setFilter({ tier: [] })}
            className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 ${
              activeTiers.length === 0
                ? 'bg-emerald-100 text-emerald-800'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            All
          </button>
          {receivableTierOrder.map((tier) => {
            const style = getReceivableTierStyle(tier);
            const isActive = activeTiers.includes(tier);

            return (
              <button
                key={tier}
                type="button"
                aria-pressed={isActive}
                onClick={() => toggleTier(tier)}
                className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 ${
                  isActive
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${style.dotClass}`} aria-hidden="true" />
                {style.filterLabel}
                <span
                  className={`tabular-nums text-xs ${isActive ? 'text-slate-300' : 'text-slate-500'}`}
                >
                  {tierCounts[tier] ?? 0}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
};
