import React from 'react';
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

export const LedgerFilters: React.FC<LedgerFiltersProps> = ({ filters, onChange }) => {
  const setFilter = (patch: FinancialLedgerFilters) => onChange({ ...filters, ...patch, page: 1 });

  return (
    <section aria-label="Ledger filters" className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Ledger type">
          {typeFilters.map((type) => (
            <button
              key={type}
              type="button"
              role="tab"
              aria-selected={(filters.type ?? 'ALL') === type}
              onClick={() =>
                setFilter({
                  type,
                  status: type === 'OVERDUE' ? 'OVERDUE' : filters.status,
                  includeCancelled: type === 'ALL' ? filters.includeCancelled : filters.includeCancelled,
                })
              }
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

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_160px_160px_160px_160px]">
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
            Status
            <select
              value={filters.status ?? ''}
              onChange={(event) =>
                setFilter({
                  status: (event.target.value || undefined) as FinancialLedgerStatusFilter | undefined,
                  includeCancelled:
                    event.target.value === 'CANCELLED' ? true : filters.includeCancelled,
                })
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
            Due from
            <input
              type="date"
              value={filters.dueFrom ?? ''}
              onChange={(event) => setFilter({ dueFrom: event.target.value || undefined })}
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Due to
            <input
              type="date"
              value={filters.dueTo ?? ''}
              onChange={(event) => setFilter({ dueTo: event.target.value || undefined })}
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
          </label>
          <label className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-slate-700">
            <input
              type="checkbox"
              checked={filters.includeCancelled ?? false}
              onChange={(event) => setFilter({ includeCancelled: event.target.checked })}
              className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
            />
            Include cancelled
          </label>
        </div>
      </div>
    </section>
  );
};
