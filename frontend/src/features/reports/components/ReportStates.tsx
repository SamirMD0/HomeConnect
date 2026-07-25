import React from 'react';
import { Search } from 'lucide-react';

export const ReportLoadingState: React.FC = () => (
  <div className="space-y-4">
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="h-28 animate-pulse rounded-lg border border-slate-200 bg-slate-100" />
      ))}
    </div>
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      {Array.from({ length: 7 }).map((_, index) => (
        <div key={index} className="mb-3 h-10 animate-pulse rounded bg-slate-100 last:mb-0" />
      ))}
    </div>
  </div>
);

export const ReportErrorState: React.FC<{ onRetry: () => void }> = ({ onRetry }) => (
  <div className="rounded-lg border border-red-200 bg-red-50 p-5 text-red-800" role="alert">
    <h2 className="font-semibold">Report failed to load</h2>
    <p className="mt-1 text-sm">Check access and connection, then try again.</p>
    <button
      type="button"
      onClick={onRetry}
      className="mt-3 rounded-md bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-500"
    >
      Retry
    </button>
  </div>
);

export const ReportEmptyState: React.FC = () => (
  <div className="rounded-lg border border-slate-200 bg-white p-10 text-center">
    <Search className="mx-auto h-8 w-8 text-slate-300" aria-hidden="true" />
    <h2 className="mt-3 text-lg font-semibold text-slate-900">No report rows</h2>
    <p className="mt-1 text-sm text-slate-500">Adjust the month or filters to widen the report.</p>
  </div>
);
