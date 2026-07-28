import React from 'react';
import { Users } from 'lucide-react';

export const ReceivablesLoadingState: React.FC = () => (
  <div className="space-y-4">
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="h-28 animate-pulse rounded-lg border border-slate-200 bg-slate-100" />
      ))}
    </div>
    <div className="space-y-3 md:hidden">
      {Array.from({ length: 3 }).map((_, index) => (
        <div key={index} className="h-36 animate-pulse rounded-lg border border-slate-200 bg-slate-100" />
      ))}
    </div>
    <div className="hidden rounded-xl border border-slate-200 bg-white p-4 md:block">
      {Array.from({ length: 8 }).map((_, index) => (
        <div
          key={index}
          className="mb-3 grid grid-cols-[40px_1.6fr_1fr_1fr_1fr_1fr_1fr_1fr_44px] gap-3 last:mb-0"
        >
          {Array.from({ length: 9 }).map((__, cellIndex) => (
            <div key={cellIndex} className="h-9 animate-pulse rounded bg-slate-100" />
          ))}
        </div>
      ))}
    </div>
  </div>
);

export const ReceivablesErrorState: React.FC<{ onRetry: () => void }> = ({ onRetry }) => (
  <div className="rounded-lg border border-red-200 bg-red-50 p-5 text-red-800" role="alert">
    <h2 className="font-semibold">Accounts receivable failed to load</h2>
    <p className="mt-1 text-sm">Check the connection and try again.</p>
    <button
      type="button"
      onClick={onRetry}
      className="mt-3 rounded-md bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40"
    >
      Retry
    </button>
  </div>
);

export const ReceivablesEmptyState: React.FC<{
  filtered: boolean;
  onClearFilters?: () => void;
}> = ({ filtered, onClearFilters }) => (
  <div className="rounded-xl border border-slate-200 bg-white p-10 text-center">
    <Users className="mx-auto h-8 w-8 text-slate-300" aria-hidden="true" />
    <h2 className="mt-3 text-lg font-semibold text-slate-900">
      {filtered ? 'No customers match these filters' : 'No customers yet'}
    </h2>
    <p className="mt-1 text-sm text-slate-500">
      {filtered
        ? 'Widen the filters to see more customer accounts.'
        : 'Customers appear here as soon as they are added.'}
    </p>
    {filtered && onClearFilters && (
      <button
        type="button"
        onClick={onClearFilters}
        className="mt-4 rounded-md border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30"
      >
        Clear filters
      </button>
    )}
  </div>
);
