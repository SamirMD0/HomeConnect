import React from 'react';
import { Edit3, Eye, Warehouse } from 'lucide-react';
import { formatMoney } from '../../customer-financial/utils/financial-format';
import { Product } from '../types/product.types';
import { ProductIdentity, ProductNotInInventoryChip, ProductPricingModeChip } from './ProductIdentity';
import { ProductImageView } from './ProductImageView';
import { ProductOverflowMenu } from './ProductOverflowMenu';
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
  onInventory?: () => void;
  onArchive: () => void;
  onRestore: () => void;
}

export const ProductCard: React.FC<ProductCardProps> = ({
  product, variant, selected, canAdmin, onSelect, onView, onEdit, onInventory = onView, onArchive, onRestore,
}) => {
  const pricing = product.pricing;
  const preview = pricing?.pricingAvailable ? pricing : null;
  const manualDiffers = preview != null && product.price != null && product.price !== preview.cashPrice;
  const grid = variant === 'grid';
  const stateClass = selected ? 'border-brand-300 ring-1 ring-brand-200' : product.isActive ? 'border-slate-200' : 'border-slate-300 bg-slate-50';
  const articleClass = grid
    ? `relative flex h-full flex-col rounded-xl border bg-white shadow-sm ${stateClass}`
    : `rounded-xl border bg-white shadow-sm ${stateClass}`;

  return (
    <article className={articleClass}>
      {grid && <div className="relative aspect-square w-full overflow-hidden rounded-t-xl border-b border-slate-200 bg-slate-100">
        <button type="button" onClick={onView} aria-label={`Open ${product.name} details / فتح تفاصيل المنتج`} className="h-full w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500">
          <ProductImageView productId={product.id} image={product.image} alt={product.name} fit="cover" className="h-full w-full" />
        </button>
        <input type="checkbox" checked={selected} onChange={(event) => onSelect(event.target.checked)} aria-label={`Select ${product.name}`} className="absolute left-3 top-3 h-4 w-4 rounded border-slate-300 bg-white text-brand-600 focus:ring-brand-500" />
        {/* On the grid the status rides the image, freeing the body for identity. */}
        {!product.isActive && <span className="absolute right-3 top-3"><ProductStatusBadge isActive={false} /></span>}
      </div>}

      <div className="flex items-start justify-between gap-3 p-4">
        <div className="flex min-w-0 items-start gap-3">
          {!grid && <input type="checkbox" checked={selected} onChange={(event) => onSelect(event.target.checked)} aria-label={`Select ${product.name}`} className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300 text-brand-600 focus:ring-brand-500" />}
          {!grid && <button type="button" onClick={onView} aria-label={`Open ${product.name} details / فتح تفاصيل المنتج`} className="h-12 w-12 shrink-0 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500"><ProductImageView productId={product.id} image={product.image} alt={product.name} className="h-12 w-12 rounded-md border border-slate-200" /></button>}
          <ProductIdentity product={product} onView={onView} />
        </div>
        {!grid && <ProductStatusBadge isActive={product.isActive} />}
      </div>

      <div className={grid ? 'flex-1 border-t border-slate-100 px-4 py-3' : 'border-t border-slate-100 px-4 py-3'}>
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          <ProductStockBadge status={product.stockStatus} />
          <ProductNotInInventoryChip product={product} />
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-xs text-slate-500">Cash Price / السعر النقدي</span>
          <span dir="ltr" className="text-lg font-bold tabular-nums text-brand-700">{preview ? formatMoney(preview.cashPrice) : product.price ? formatMoney(product.price) : '—'}</span>
        </div>

        {manualDiffers && <p className="mt-1 text-right text-[11px] text-amber-600">manual / يدوي <span dir="ltr" className="tabular-nums">{formatMoney(product.price as string)}</span></p>}
        {!preview && product.price && <p className="mt-1 text-right text-[11px] text-slate-400">manual price only / سعر يدوي فقط</p>}

        {/*
          One line, not a three-row table. The down payment and monthly schedule
          are a quote the operator reads out; the card only needs to say that an
          installment price exists and what it is. The full breakdown is one
          click away in the drawer's Pricing section.
        */}
        {preview?.installmentPrice && <div className="mt-1 flex items-baseline justify-between gap-3 text-xs">
          <span className="truncate text-slate-500">
            {preview.installmentMonths ? `Installment × ${preview.installmentMonths} / التقسيط` : 'Installment / التقسيط'}
          </span>
          <span dir="ltr" className="shrink-0 font-semibold tabular-nums text-slate-900">{formatMoney(preview.installmentPrice)}</span>
        </div>}

        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-dashed border-slate-200 pt-3">
          <ProductPricingModeChip product={product} />
          {canAdmin && pricing?.costPrice && <span className="ms-auto text-[11px] text-slate-500">Cost / التكلفة <strong dir="ltr" className="font-semibold tabular-nums text-slate-700">{formatMoney(pricing.costPrice)}</strong></span>}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-4 py-3">
        <button type="button" onClick={onView} className="inline-flex items-center gap-2 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-sm font-semibold text-brand-700 hover:bg-brand-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50"><Eye className="h-4 w-4" />Details / التفاصيل</button>
        <IconButton label="Edit product / تعديل المنتج" onClick={onEdit}><Edit3 className="h-4 w-4" /></IconButton>
        <IconButton label="Inventory / المخزون" onClick={onInventory}><Warehouse className="h-4 w-4" /></IconButton>
        <ProductOverflowMenu product={product} canAdmin={canAdmin} onArchive={onArchive} onRestore={onRestore} />
      </div>
    </article>
  );
};

const IconButton: React.FC<{ label: string; onClick: () => void; children: React.ReactNode }> = ({ label, onClick, children }) => (
  <button type="button" title={label} aria-label={label} onClick={onClick} className="rounded-lg border border-slate-300 p-2 text-slate-600 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50">{children}</button>
);
