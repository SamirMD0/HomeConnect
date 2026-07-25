import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface FinancialErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
}

export const FinancialErrorState: React.FC<FinancialErrorStateProps> = ({
  title = 'Financial profile failed to load',
  message,
  onRetry,
}) => (
  <div className="rounded-lg border border-red-200 bg-red-50 p-5 text-red-800" role="alert">
    <div className="flex items-start gap-3">
      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="mt-1 text-sm text-red-700">{message}</p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-3 inline-flex items-center gap-2 rounded-md border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500/30"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Retry
          </button>
        )}
      </div>
    </div>
  </div>
);
