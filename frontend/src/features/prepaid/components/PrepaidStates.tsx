import React from 'react';
import { AlertTriangle, Loader2, PackageOpen } from 'lucide-react';
import { businessLabels } from '../../../shared/labels/business-labels';

export const PrepaidLoadingState: React.FC = () => (
  <div className="flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white py-12 text-slate-500 shadow-sm">
    <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
    <span>Loading…</span>
  </div>
);

export const PrepaidErrorState: React.FC<{ onRetry: () => void }> = ({ onRetry }) => (
  <div
    role="alert"
    className="flex flex-col items-center gap-3 rounded-lg border border-red-200 bg-red-50 py-10 text-center text-red-700"
  >
    <AlertTriangle className="h-6 w-6" aria-hidden="true" />
    <p className="text-sm font-medium">Could not load prepaid purchases</p>
    <button
      type="button"
      onClick={onRetry}
      className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-sm font-semibold text-red-700 hover:bg-red-100"
    >
      Retry
    </button>
  </div>
);

export const PrepaidEmptyState: React.FC = () => (
  <div className="flex flex-col items-center gap-2 rounded-lg border border-slate-200 bg-white py-12 text-center text-slate-500 shadow-sm">
    <PackageOpen className="h-6 w-6" aria-hidden="true" />
    <p className="text-sm">{businessLabels.prepaid.empty}</p>
  </div>
);
