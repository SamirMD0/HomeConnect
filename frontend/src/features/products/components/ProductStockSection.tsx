import React from 'react';
import { ProductStockInput } from '../types/product.types';

export const ProductStockSection: React.FC<{ value: ProductStockInput; onChange: (value: ProductStockInput) => void }> = ({ value, onChange }) => (
  <section className="space-y-3 rounded-lg border border-slate-200 p-4">
    <div><h3 className="font-semibold text-slate-900">Stock / المخزون</h3><p className="text-xs text-slate-500">Basic recorded quantity only; no automatic stock movements.</p></div>
    <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={value.trackStock} onChange={(event) => onChange({ ...value, trackStock: event.target.checked })} />Track stock / تتبع المخزون</label>
    <div className={`grid gap-4 sm:grid-cols-2 ${value.trackStock ? '' : 'opacity-55'}`}>
      <NumberField label="Quantity / الكمية" value={value.stockQuantity} disabled={!value.trackStock} onChange={(stockQuantity) => onChange({ ...value, stockQuantity: stockQuantity === '' ? 0 : stockQuantity })} />
      <NumberField label="Low-stock threshold / حد المخزون المنخفض" value={value.lowStockThreshold ?? ''} disabled={!value.trackStock} onChange={(next) => onChange({ ...value, lowStockThreshold: next === '' ? null : next })} />
    </div>
  </section>
);

const NumberField: React.FC<{ label: string; value: number | ''; disabled: boolean; onChange: (value: number | '') => void }> = ({ label, value, disabled, onChange }) => <label className="text-sm font-medium text-slate-700">{label}<input type="number" min="0" step="1" value={value} disabled={disabled} onChange={(event) => onChange(event.target.value === '' ? '' : Number(event.target.value))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 disabled:bg-slate-100" /></label>;
