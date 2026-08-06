import React, { useEffect, useRef } from 'react';
import { Product } from '../types/product.types';
import { ProductCard } from './ProductCard';

interface ProductGridProps {
  products: Product[];
  selectedIds: Set<string>;
  canAdmin: boolean;
  onSelect: (id: string, selected: boolean) => void;
  onSelectAll: (selected: boolean) => void;
  onView: (product: Product) => void;
  onEdit: (product: Product) => void;
  onArchive: (product: Product) => void;
  onRestore: (product: Product) => void;
}

export const ProductGrid: React.FC<ProductGridProps> = ({
  products, selectedIds, canAdmin, onSelect, onSelectAll, onView, onEdit, onArchive, onRestore,
}) => {
  const ref = useRef<HTMLInputElement>(null);
  const selectedCount = products.filter((product) => selectedIds.has(product.id)).length;
  const allSelected = products.length > 0 && selectedCount === products.length;
  useEffect(() => { if (ref.current) ref.current.indeterminate = selectedCount > 0 && !allSelected; }, [allSelected, selectedCount]);

  return <section className="space-y-3" aria-label="Product grid / شبكة المنتجات">
    <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
      <input ref={ref} type="checkbox" checked={allSelected} onChange={(event) => onSelectAll(event.target.checked)} className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500" />
      Select all on this page / تحديد الكل في هذه الصفحة
    </label>
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {products.map((product) => <ProductCard key={product.id} product={product} variant="grid" selected={selectedIds.has(product.id)} canAdmin={canAdmin} onSelect={(selected) => onSelect(product.id, selected)} onView={() => onView(product)} onEdit={() => onEdit(product)} onArchive={() => onArchive(product)} onRestore={() => onRestore(product)} />)}
    </div>
  </section>;
};

export const ProductGridSkeleton: React.FC = () => (
  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" aria-label="Loading product grid / جارٍ تحميل شبكة المنتجات">
    {Array.from({ length: 8 }, (_, index) => <div key={index} className="overflow-hidden rounded-lg border border-slate-200 bg-white"><div className="aspect-square animate-pulse bg-slate-100" /><div className="space-y-3 p-4"><div className="h-4 w-2/3 animate-pulse rounded bg-slate-100" /><div className="h-3 w-1/2 animate-pulse rounded bg-slate-100" /><div className="h-8 animate-pulse rounded bg-slate-100" /></div></div>)}
  </div>
);
