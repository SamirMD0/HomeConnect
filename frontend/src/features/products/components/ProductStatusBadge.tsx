import React from 'react';
import { businessLabels, englishLabel } from '../../../shared/labels/business-labels';

export const ProductStatusBadge: React.FC<{ isActive: boolean }> = ({ isActive }) => (
  <span className={`inline-flex whitespace-nowrap rounded-md border px-2 py-1 text-xs font-semibold ${
    isActive
      ? 'border-brand-200 bg-brand-50 text-brand-700'
      : 'border-slate-300 bg-slate-100 text-slate-600'
  }`}>
    {englishLabel(isActive ? businessLabels.product.active : businessLabels.product.archived)}
  </span>
);
