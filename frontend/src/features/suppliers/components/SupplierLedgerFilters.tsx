import React from 'react';
import { Supplier, SupplierLedgerFilters as FilterValues, SupplierTransactionType } from '../types/supplier.types';
import { supplierTransactionTypeLabels } from '../utils/supplier-labels';

interface Props { filters: FilterValues; suppliers: Supplier[]; onChange: (changes: Partial<FilterValues>) => void; onClear: () => void }

export const SupplierLedgerFilters: React.FC<Props> = ({ filters, suppliers, onChange, onClear }) => <section className="rounded-lg border border-slate-200 bg-white p-4" aria-label="Supplier ledger filters">
  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
    <label className="text-xs font-semibold text-slate-600 xl:col-span-2">Search / بحث<input value={filters.search ?? ''} onChange={(event) => onChange({ search: event.target.value || undefined, page: 1 })} placeholder="Description or reference / الوصف أو المرجع" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-normal" /></label>
    <label className="text-xs font-semibold text-slate-600">Supplier / المورّد<select value={filters.supplierId ?? ''} onChange={(event) => onChange({ supplierId: event.target.value || undefined, page: 1 })} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-normal"><option value="">All / الكل</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name} - {supplier.phone}</option>)}</select></label>
    <label className="text-xs font-semibold text-slate-600">Type / النوع<select value={filters.type ?? ''} onChange={(event) => onChange({ type: (event.target.value || undefined) as SupplierTransactionType | undefined, page: 1 })} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-normal"><option value="">All / الكل</option>{Object.entries(supplierTransactionTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    <label className="text-xs font-semibold text-slate-600">From / من<input type="date" value={filters.dateFrom ?? ''} onChange={(event) => onChange({ dateFrom: event.target.value || undefined, page: 1 })} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-normal" /></label>
    <label className="text-xs font-semibold text-slate-600">To / إلى<input type="date" value={filters.dateTo ?? ''} onChange={(event) => onChange({ dateTo: event.target.value || undefined, page: 1 })} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-normal" /></label>
  </div>
  <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t pt-3"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(filters.includeRemoved)} onChange={(event) => onChange({ includeRemoved: event.target.checked, page: 1 })} />Include removed / إظهار المحذوف</label><button type="button" onClick={onClear} className="rounded-md border px-3 py-2 text-sm font-semibold hover:bg-slate-50">Clear filters / مسح الفلاتر</button></div>
</section>;
