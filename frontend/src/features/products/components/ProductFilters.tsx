import React from 'react';
import { ScanLine } from 'lucide-react';
import { ProductFilters as ProductFilterValues, ProductSortBy, ProductSortOrder } from '../types/product.types';
import { productLabels } from '../utils/product-labels';

interface ProductFiltersProps {
  filters: ProductFilterValues;
  search: string;
  onSearchChange: (value: string) => void;
  onChange: (patch: Partial<ProductFilterValues>) => void;
  onSearchSubmit: () => void;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
}

export const ProductFilters: React.FC<ProductFiltersProps> = ({ filters, search, onSearchChange, onChange, onSearchSubmit, searchInputRef }) => (
  <section className="border-y border-slate-200 bg-white py-4">
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(20rem,2fr)_repeat(4,minmax(9rem,1fr))]">
      <label className="relative min-w-0">
        <span className="sr-only">Search products</span>
        <ScanLine className="absolute left-3 top-3 h-4 w-4 text-emerald-600" />
        <input ref={searchInputRef} autoFocus value={search} onChange={(event) => onSearchChange(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); onSearchSubmit(); } }} placeholder={productLabels.searchPlaceholder} className="w-full rounded-lg border border-slate-300 py-2.5 pl-9 pr-3 text-sm" />
      </label>
      <input value={filters.brand ?? ''} onChange={(event) => onChange({ brand: event.target.value || undefined, page: 1 })} placeholder={productLabels.allBrands} className="min-w-0 rounded-lg border border-slate-300 px-3 py-2.5 text-sm" dir="auto" />
      <select value={filters.hasBarcode === undefined ? '' : String(filters.hasBarcode)} onChange={(event) => onChange({ hasBarcode: event.target.value === '' ? undefined : event.target.value === 'true', page: 1 })} className="min-w-0 rounded-lg border border-slate-300 px-3 py-2.5 text-sm">
        <option value="">{productLabels.anyBarcode}</option>
        <option value="true">{productLabels.withBarcode}</option>
        <option value="false">{productLabels.withoutBarcode}</option>
      </select>
      <select value={filters.sortBy ?? 'name'} onChange={(event) => onChange({ sortBy: event.target.value as ProductSortBy, page: 1 })} className="min-w-0 rounded-lg border border-slate-300 px-3 py-2.5 text-sm">
        <option value="name">Name / الاسم</option>
        <option value="model">Model / الموديل</option>
        <option value="brand">Brand / الماركة</option>
        <option value="price">Manual price / السعر اليدوي</option>
        <option value="createdAt">Recently Added / المضاف حديثاً</option>
        <option value="updatedAt">Recently Updated / المعدل حديثاً</option>
      </select>
      <select value={filters.sortOrder ?? 'asc'} onChange={(event) => onChange({ sortOrder: event.target.value as ProductSortOrder, page: 1 })} className="min-w-0 rounded-lg border border-slate-300 px-3 py-2.5 text-sm">
        <option value="asc">Ascending / تصاعدي</option>
        <option value="desc">Descending / تنازلي</option>
      </select>
    </div>
  </section>
);
