import React from 'react';

export const FinancialLoadingState: React.FC = () => (
  <div className="space-y-6" aria-live="polite" aria-busy="true">
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, index) => (
        <div
          key={index}
          className="h-28 animate-pulse rounded-lg border border-slate-200 bg-slate-100"
        />
      ))}
    </div>
    <div className="h-56 animate-pulse rounded-lg border border-slate-200 bg-slate-100" />
    <span className="sr-only">Loading customer financial profile</span>
  </div>
);
