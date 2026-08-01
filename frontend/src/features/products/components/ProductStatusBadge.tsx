import React from 'react';
import { businessLabels } from '../../../shared/labels/business-labels';

export const ProductStatusBadge: React.FC<{ isActive: boolean }> = ({ isActive }) => (
  <span className={`inline-flex whitespace-nowrap rounded-md border px-2 py-1 text-xs font-semibold ${
    isActive
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : 'border-slate-300 bg-slate-100 text-slate-600'
  }`}>
    {isActive ? businessLabels.product.active : businessLabels.product.archived}
  </span>
);
