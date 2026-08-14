import { Search, X } from 'lucide-react';
import React from 'react';

export const ProductSearchInput: React.FC<{
  value: string;
  onChange: (value: string) => void;
  isLoading?: boolean;
  resultCount?: number;
}> = ({ value, onChange, isLoading, resultCount }) => <div className="relative">
  <Search className="pointer-events-none absolute left-3 top-2.5 h-5 w-5 text-slate-400" />
  <input
    type="search"
    dir="auto"
    aria-label="Search products / بحث عن المنتجات"
    className="user-text-input block w-full rounded-lg border border-slate-300 py-2 pl-10 pr-10 text-sm focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
    value={value}
    onChange={(event) => onChange(event.target.value)}
    placeholder="Name, model, SKU or barcode / الاسم أو الموديل أو الرمز أو الباركود"
  />
  {value && <button type="button" aria-label="Clear product search" onClick={() => onChange('')} className="absolute right-3 top-2.5 text-slate-400"><X className="h-4 w-4" /></button>}
  <span className="sr-only" aria-live="polite">{isLoading ? 'Loading products' : resultCount === undefined ? '' : `${resultCount} products`}</span>
</div>;
