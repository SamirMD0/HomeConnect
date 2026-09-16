import React from 'react';
import { PackageSearch } from 'lucide-react';
import { Product } from '../types/product.types';
import { productLabels } from '../utils/product-labels';

/**
 * The identity block shared by the table row, the grid card, and the list card,
 * so a product reads the same wherever it appears.
 *
 * Brand gets its own line above the name rather than being appended after the
 * model with a separator. In this catalogue brand is how staff narrow a shelf
 * ("the Kozano one"), and burying it mid-sentence in 11px grey made it the
 * least legible field on a page that filters by it.
 *
 * SKU and barcode share a line: both are codes, both are read digit by digit,
 * and pairing them costs one row instead of two.
 */
export const ProductIdentity: React.FC<{ product: Product; onView: () => void }> = ({ product, onView }) => (
  <span className="min-w-0 flex-1">
    {product.brand && (
      <span className="user-text block truncate text-[11px] font-semibold uppercase tracking-wide text-slate-500" dir="auto">
        {product.brand}
      </span>
    )}
    <button
      type="button"
      onClick={onView}
      className="user-text block max-w-full truncate text-left font-semibold text-slate-900 hover:text-brand-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50"
      dir="auto"
    >
      {product.name}
    </button>
    <span className="user-text mt-0.5 block truncate text-xs text-slate-600" dir="auto">{product.model}</span>
    {product.categoryPath && <span className="mt-0.5 block truncate text-xs text-slate-500" title={product.categoryPath}>{product.categoryPath}</span>}
    <span className="mt-0.5 block truncate font-mono text-[11px] text-slate-500">
      <span className="font-semibold text-slate-600">{product.sku}</span>
      {product.barcode && <span className="text-slate-400"> · {product.barcode}</span>}
    </span>
  </span>
);

/**
 * Shown only for a product that has never had a stock movement and was never
 * switched on for tracking. It sits beside the stock badge because "Not
 * tracked" and "never entered inventory" look identical on the shelf but need
 * different work: one is a deliberate setting, the other is an omission.
 */
export const ProductNotInInventoryChip: React.FC<{ product: Product }> = ({ product }) => {
  if (!product.notInInventory) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600 ring-1 ring-inset ring-slate-600/15">
      <PackageSearch className="h-3.5 w-3.5" aria-hidden="true" />
      {productLabels.notInInventory}
    </span>
  );
};

export const ProductPricingModeChip: React.FC<{ product: Product }> = ({ product }) => {
  const pricing = product.pricing;
  const mode = pricing?.mode ?? (pricing?.useCustomPricing ? 'CUSTOM' : pricing?.presetName ? 'PRESET' : product.price ? 'MANUAL' : 'NONE');
  if (mode === 'CUSTOM') return <span className="rounded bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700">Custom / مخصص</span>;
  if (mode === 'PRESET') return <span dir="auto" className="max-w-full truncate rounded bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">{pricing?.presetName ?? 'Preset / صيغة جاهزة'}</span>;
  if (mode === 'MANUAL') return <span className="rounded bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">Manual / يدوي</span>;
  return <span className="text-[11px] text-slate-400">No pricing / دون تسعير</span>;
};
