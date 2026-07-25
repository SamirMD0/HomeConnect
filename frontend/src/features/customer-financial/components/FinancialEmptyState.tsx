import React from 'react';
import { FileSearch } from 'lucide-react';

interface FinancialEmptyStateProps {
  title: string;
  description: string;
}

export const FinancialEmptyState: React.FC<FinancialEmptyStateProps> = ({
  title,
  description,
}) => (
  <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/70 px-4 py-8 text-center">
    <FileSearch className="mx-auto mb-3 h-8 w-8 text-slate-300" aria-hidden="true" />
    <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
    <p className="mt-1 text-sm text-slate-500">{description}</p>
  </div>
);
