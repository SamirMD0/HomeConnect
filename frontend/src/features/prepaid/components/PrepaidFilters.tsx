import React from 'react';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import { PrepaidFilters as PrepaidFiltersType, PrepaidStatusFilter } from '../types/prepaid.types';
import {
  countActivePrepaidFilters,
  hasActivePrepaidFilters,
  resetPrepaidFilters,
} from '../utils/prepaid-query';
import { businessLabels } from '../../../shared/labels/business-labels';
import { prepaidStatusLabels } from '../utils/prepaid-labels';

interface PrepaidFiltersProps {
  filters: PrepaidFiltersType;
  onChange: (filters: PrepaidFiltersType) => void;
}

const statusTabs: Array<{ value: PrepaidStatusFilter; label: string }> = [
  { value: 'PENDING', label: prepaidStatusLabels.PENDING },
  { value: 'DELIVERED', label: prepaidStatusLabels.DELIVERED },
  { value: 'CANCELLED', label: prepaidStatusLabels.CANCELLED },
  { value: 'ALL', label: 'All / الكل' },
];

export const PrepaidFilters: React.FC<PrepaidFiltersProps> = ({ filters, onChange }) => {
  const [showAdvanced, setShowAdvanced] = React.useState(false);
  const advancedCount = countActivePrepaidFilters(filters);

  // Every filter change returns to page 1; otherwise the user can land on an
  // out-of-range page and see an empty table.
  const update = (patch: PrepaidFiltersType) => onChange({ ...filters, ...patch, page: 1 });

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label={businessLabels.prepaid.status} className="flex flex-wrap gap-1">
          {statusTabs.map((tab) => {
            const isActive = (filters.status ?? 'PENDING') === tab.value;
            return (
              <button
                key={tab.value}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => update({ status: tab.value })}
                className={`min-h-10 rounded-lg px-3 py-1.5 text-sm font-medium ${
                  isActive
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="relative min-w-[12rem] flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
          <input
            type="search"
            dir="auto"
            value={filters.search ?? ''}
            onChange={(event) => update({ search: event.target.value })}
            placeholder={`${businessLabels.common.search} — ${businessLabels.common.customer} / ${businessLabels.prepaid.item}`}
            aria-label={businessLabels.common.search}
            className="user-text-input block w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          />
        </div>

        <label className="inline-flex min-h-10 items-center gap-2 rounded-lg px-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={Boolean(filters.fullyPaidOnly)}
            onChange={(event) => update({ fullyPaidOnly: event.target.checked })}
            className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
          />
          {businessLabels.prepaid.fullyPaidOnly}
        </label>

        <button
          type="button"
          onClick={() => setShowAdvanced((value) => !value)}
          className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
          More Filters{advancedCount > 0 ? ` (${advancedCount})` : ''}
        </button>

        {hasActivePrepaidFilters(filters) && (
          <button
            type="button"
            onClick={() => onChange(resetPrepaidFilters())}
            className="inline-flex min-h-10 items-center gap-1 rounded-lg px-2 text-sm font-medium text-slate-500 hover:text-slate-700"
          >
            <X className="h-4 w-4" aria-hidden="true" />
            {businessLabels.common.cancel}
          </button>
        )}
      </div>

      {showAdvanced && (
        <div className="grid grid-cols-1 gap-3 border-t border-slate-100 pt-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block text-sm font-medium text-slate-700">
            From
            <input
              type="date"
              value={filters.dateFrom ?? ''}
              onChange={(event) => update({ dateFrom: event.target.value || undefined })}
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            To
            <input
              type="date"
              value={filters.dateTo ?? ''}
              onChange={(event) => update({ dateTo: event.target.value || undefined })}
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Sort by
            <select
              value={filters.sortBy ?? 'createdAt'}
              onChange={(event) =>
                update({ sortBy: event.target.value as PrepaidFiltersType['sortBy'] })
              }
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            >
              <option value="createdAt">{businessLabels.common.created}</option>
              <option value="customerName">{businessLabels.common.customer}</option>
              <option value="adminDebt">{businessLabels.prepaid.adminDebt}</option>
            </select>
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Order
            <select
              value={filters.sortOrder ?? 'desc'}
              onChange={(event) =>
                update({ sortOrder: event.target.value as PrepaidFiltersType['sortOrder'] })
              }
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            >
              <option value="desc">Newest first</option>
              <option value="asc">Oldest first</option>
            </select>
          </label>
        </div>
      )}
    </div>
  );
};
