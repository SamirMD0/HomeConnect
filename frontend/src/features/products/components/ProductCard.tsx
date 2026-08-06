import React from 'react';
import { Archive, Edit3, Eye, Printer, RotateCcw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { formatMoney } from '../../customer-financial/utils/financial-format';
import { Product } from '../types/product.types';
import { ProductImageView } from './ProductImageView';
import { ProductStatusBadge } from './ProductStatusBadge';
import { ProductStockBadge } from './ProductStockBadge';

export interface ProductCardProps {
  product: Product;
  variant: 'list' | 'grid';
  selected: boolean;
  canAdmin: boolean;
  onSelect: (selected: boolean) => void;
  onView: () => void;
  onEdit: () => void;
  onArchive: () => void;
  onRestore: () => void;
}

export const ProductCard: React.FC<ProductCardProps> = ({
  product, variant, selected, canAdmin, onSelect, onView, onEdit, onArchive, onRestore,
}) => {
  const pricing = product.pricing;
  const preview = pricing?.pricingAvailable ? pricing : null;
  const manualDiffers = preview != null && product.price != null && product.price !== preview.cashPrice;
  const grid = variant === 'grid';
  const stateClass = selected ? 'border-emerald-300 ring-1 ring-emerald-200' : product.isActive ? 'border-slate-200' : 'border-slate-300 bg-slate-50';
  const articleClass = grid
    ? `flex h-full flex-col overflow-hidden rounded-lg border bg-white shadow-sm ${stateClass}`
    : `rounded-lg border bg-white shadow-sm ${stateClass}`;

  return (
    <article className={articleClass}>
      {grid && <div className="relative aspect-square w-full overflow-hidden border-b border-slate-200 bg-slate-100">
        <ProductImageView productId={product.id} image={product.image} alt={product.name} fit="cover" className="h-full w-full" />
        <input type="checkbox" checked={selected} onChange={(event) => onSelect(event.target.checked)} aria-label={`Select ${product.name}`} className="absolute left-3 top-3 h-4 w-4 rounded border-slate-300 bg-white text-emerald-600 focus:ring-emerald-500" />
      </div>}

      <div className="flex items-start justify-between gap-3 p-4">
        <label className="flex min-w-0 items-start gap-3">
          {!grid && <input type="checkbox" checked={selected} onChange={(event) => onSelect(event.target.checked)} aria-label={`Select ${product.name}`} className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500" />}
          {!grid && <ProductImageView productId={product.id} image={product.image} alt="" className="h-12 w-12 shrink-0 rounded-md border border-slate-200" />}
          <span className="min-w-0">
            <span className="user-text block truncate font-semibold text-slate-900" dir="auto">{product.name}</span>
            <span className="user-text block truncate text-sm text-slate-500" dir="auto">{product.model}{product.brand ? ` · ${product.brand}` : ''}</span>
            {product.barcode && <span className="block truncate font-mono text-[11px] text-slate-400">{product.barcode}</span>}
            <span className="block truncate font-mono text-[11px] font-semibold text-slate-600">{product.sku}</span>
          </span>
        </label>
        <ProductStatusBadge isActive={product.isActive} />
      </div>

      <div className={grid ? 'flex-1 border-t border-slate-100 px-4 py-3' : 'border-t border-slate-100 px-4 py-3'}>
        <div className="mb-3"><ProductStockBadge status={product.stockStatus} /></div>
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-xs text-slate-500">Cash Price / السعر النقدي</span>
          <span dir="ltr" className="text-lg font-bold tabular-nums text-emerald-700">{preview ? formatMoney(preview.cashPrice) : product.price ? formatMoney(product.price) : '—'}</span>
        </div>

        {manualDiffers && <p className="mt-1 text-right text-[11px] text-amber-600">manual / يدوي <span dir="ltr" className="tabular-nums">{formatMoney(product.price as string)}</span></p>}
        {!preview && product.price && <p className="mt-1 text-right text-[11px] text-slate-400">manual price only / سعر يدوي فقط</p>}

        {preview?.installmentPrice && <dl className="mt-3 space-y-1.5 border-t border-dashed border-slate-200 pt-3">
          <Row label="Installment / التقسيط" value={formatMoney(preview.installmentPrice)} strong />
          {preview.downPayment && <Row label="Down Payment / الدفعة الأولى" value={formatMoney(preview.downPayment)} />}
          {preview.monthlyPayment && <Row label={preview.installmentMonths ? `Monthly × ${preview.installmentMonths} / القسط الشهري` : 'Monthly / القسط الشهري'} value={formatMoney(preview.monthlyPayment)} />}
        </dl>}

        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-dashed border-slate-200 pt-3">
          <PricingModeChip product={product} />
          {canAdmin && pricing?.costPrice && <span className="ms-auto text-[11px] text-slate-500">Cost / التكلفة <strong dir="ltr" className="font-semibold tabular-nums text-slate-700">{formatMoney(pricing.costPrice)}</strong></span>}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-4 py-3">
        <button type="button" onClick={onView} className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700"><Eye className="h-4 w-4" />Details / التفاصيل</button>
        <IconButton label="Edit product / تعديل المنتج" onClick={onEdit}><Edit3 className="h-4 w-4" /></IconButton>
        <Link to={`/products/${product.id}/label`} title="Print label / طباعة الملصق" aria-label="Print label / طباعة الملصق" className="rounded-lg border border-slate-300 p-2 text-slate-600 hover:bg-slate-100"><Printer className="h-4 w-4" /></Link>
        {canAdmin && (product.isActive
          ? <IconButton label="Archive product / أرشفة المنتج" onClick={onArchive}><Archive className="h-4 w-4" /></IconButton>
          : <IconButton label="Restore product / استعادة المنتج" onClick={onRestore}><RotateCcw className="h-4 w-4" /></IconButton>)}
      </div>
    </article>
  );
};

const PricingModeChip: React.FC<{ product: Product }> = ({ product }) => {
  const pricing = product.pricing;
  const mode = pricing?.mode ?? (pricing?.useCustomPricing ? 'CUSTOM' : pricing?.presetName ? 'PRESET' : product.price ? 'MANUAL' : 'NONE');
  if (mode === 'CUSTOM') return <span className="rounded bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700">Custom / مخصص</span>;
  if (mode === 'PRESET') return <span dir="auto" className="max-w-full truncate rounded bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">{pricing?.presetName ?? 'Preset / صيغة جاهزة'}</span>;
  if (mode === 'MANUAL') return <span className="rounded bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">Manual / يدوي</span>;
  return <span className="text-[11px] text-slate-400">No pricing / دون تسعير</span>;
};

const Row: React.FC<{ label: string; value: string; strong?: boolean }> = ({ label, value, strong }) => (
  <div className="flex items-baseline justify-between gap-3 text-xs"><dt className="truncate text-slate-500">{label}</dt><dd dir="ltr" className={`shrink-0 tabular-nums ${strong ? 'font-semibold text-slate-900' : 'font-medium text-slate-700'}`}>{value}</dd></div>
);

const IconButton: React.FC<{ label: string; onClick: () => void; children: React.ReactNode }> = ({ label, onClick, children }) => (
  <button type="button" title={label} aria-label={label} onClick={onClick} className="rounded-lg border border-slate-300 p-2 text-slate-600 hover:bg-slate-100">{children}</button>
);
