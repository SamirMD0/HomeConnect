import React, { useEffect, useMemo, useRef, useState } from 'react';
import { LayoutGrid, List, Package, Plus } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { Pagination } from '../../components/ui/Pagination';
import { ProductArchiveDialog } from '../../features/products/components/ProductArchiveDialog';
import { ProductBulkActionsBar } from '../../features/products/components/ProductBulkActionsBar';
import { ProductDetailsDrawer } from '../../features/products/components/ProductDetailsDrawer';
import { ProductFilters } from '../../features/products/components/ProductFilters';
import { ProductFormDialog } from '../../features/products/components/ProductFormDialog';
import { ProductGrid, ProductGridSkeleton } from '../../features/products/components/ProductGrid';
import { ProductRestoreDialog } from '../../features/products/components/ProductRestoreDialog';
import { ProductsTable } from '../../features/products/components/ProductsTable';
import { useProducts } from '../../features/products/hooks/useProducts';
import { Product, ProductFilters as ProductFilterValues, ProductSortBy, ProductSortOrder } from '../../features/products/types/product.types';
import { productLabels } from '../../features/products/utils/product-labels';
import { productViewSearchParams, resolveProductView } from '../../features/products/utils/product-view';
import { businessLabels } from '../../shared/labels/business-labels';
import { useAuth } from '../../hooks/useAuth';

export const ProductsPage: React.FC = () => {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get('search') ?? '');
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [formOpen, setFormOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [archiveProduct, setArchiveProduct] = useState<Product | null>(null);
  const [restoreProduct, setRestoreProduct] = useState<Product | null>(null);
  const [scannedValue, setScannedValue] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const view = resolveProductView(params, typeof window !== 'undefined' ? window.localStorage.getItem('products:view') : null);

  useEffect(() => { const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 300); return () => window.clearTimeout(timer); }, [search]);
  useEffect(() => {
    const next = new URLSearchParams(params);
    if (debouncedSearch) next.set('search', debouncedSearch); else next.delete('search');
    next.delete('page');
    if (next.toString() !== params.toString()) setParams(next, { replace: true });
  }, [debouncedSearch, params, setParams]);

  const filters = useMemo<ProductFilterValues>(() => ({
    search: params.get('search') || undefined,
    isActive: params.get('status') !== 'archived',
    brand: params.get('brand') || undefined,
    hasBarcode: params.has('hasBarcode') ? params.get('hasBarcode') === 'true' : undefined,
    sortBy: (params.get('sortBy') as ProductSortBy | null) ?? 'name',
    sortOrder: (params.get('sortOrder') as ProductSortOrder | null) ?? 'asc',
    page: Math.max(1, Number(params.get('page') || 1)),
    pageSize: 25,
  }), [params]);
  const products = useProducts(filters);
  const focusedId = params.get('focus');

  useEffect(() => {
    if (!scannedValue || products.isFetching) return;
    const exact = products.data?.items.find((item) => item.exactMatch);
    if (exact) { focus(exact.id); setScannedValue(null); }
  // focus is intentionally URL-backed; this effect only reacts to scan results.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products.data, products.isFetching, scannedValue]);

  useEffect(() => {
    if (!formOpen && !focusedId && !archiveProduct && !restoreProduct) searchInputRef.current?.focus();
  }, [archiveProduct, focusedId, formOpen, restoreProduct]);

  const updateFilters = (patch: Partial<ProductFilterValues>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined || value === '') next.delete(key);
      else next.set(key, String(value));
    }
    setParams(next);
  };
  const setStatus = (status: 'active' | 'archived') => {
    const next = new URLSearchParams(params);
    next.set('status', status);
    next.delete('page');
    setSelectedIds(new Set());
    setParams(next);
  };
  const setView = (nextView: 'table' | 'grid') => {
    const next = productViewSearchParams(params, nextView);
    window.localStorage.setItem('products:view', nextView);
    setParams(next, { replace: true });
  };
  const focus = (id: string | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set('focus', id); else next.delete('focus');
    setParams(next, { replace: true });
  };
  const openEdit = (product: Product) => { focus(null); setEditingProduct(product); setFormOpen(true); };
  const openArchive = (product: Product) => { focus(null); setArchiveProduct(product); };
  const openRestore = (product: Product) => { focus(null); setRestoreProduct(product); };
  const closeForm = () => { setFormOpen(false); setEditingProduct(null); };
  const visible = products.data?.items ?? [];
  const submitScan = () => {
    const value = search.trim(); if (!value) return;
    const next = new URLSearchParams(params); next.set('search', value); next.delete('page'); setParams(next);
    setDebouncedSearch(value); setScannedValue(value);
  };

  return <div className="space-y-5">
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div><div className="flex items-center gap-3"><Package className="h-7 w-7 text-emerald-600" /><h1 className="text-2xl font-bold text-slate-900">{businessLabels.product.products}</h1></div><p className="mt-1 text-sm text-slate-500">Manage the product catalogue and printable labels / إدارة دليل المنتجات والملصقات.</p></div>
      <button type="button" onClick={() => { setEditingProduct(null); setFormOpen(true); }} className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white"><Plus className="h-4 w-4" /> {businessLabels.product.addProduct}</button>
    </header>

    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200">
      <div className="flex gap-1">
        <button type="button" onClick={() => setStatus('active')} className={`border-b-2 px-4 py-2 text-sm font-semibold ${filters.isActive ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-slate-500'}`}>{productLabels.activeProducts}</button>
        <button type="button" onClick={() => setStatus('archived')} className={`border-b-2 px-4 py-2 text-sm font-semibold ${!filters.isActive ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-slate-500'}`}>{productLabels.archivedProducts}</button>
      </div>
      <div className="mb-1 inline-flex rounded-lg border border-slate-300 bg-white p-1" aria-label="Product view / طريقة عرض المنتجات">
        <button type="button" aria-pressed={view === 'table'} onClick={() => setView('table')} className={`inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-semibold ${view === 'table' ? 'bg-emerald-50 text-emerald-700' : 'text-slate-500'}`}><List className="h-4 w-4" />Table / جدول</button>
        <button type="button" aria-pressed={view === 'grid'} onClick={() => setView('grid')} className={`inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-semibold ${view === 'grid' ? 'bg-emerald-50 text-emerald-700' : 'text-slate-500'}`}><LayoutGrid className="h-4 w-4" />Grid / شبكة</button>
      </div>
    </div>

    <ProductBulkActionsBar selectedIds={[...selectedIds]} visibleIds={visible.map((product) => product.id)} onClear={() => setSelectedIds(new Set())} />

    <ProductFilters filters={filters} search={search} onSearchChange={(value) => { setSearch(value); setScannedValue(null); }} onSearchSubmit={submitScan} searchInputRef={searchInputRef} onChange={updateFilters} />
    {scannedValue && !products.isFetching && !visible.some((item) => item.exactMatch) && <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-medium text-amber-900">No product found for <span className="font-mono">{scannedValue}</span> / لم يتم العثور على المنتج</p>}

    {products.isLoading ? view === 'grid' ? <ProductGridSkeleton /> : <div className="p-12 text-center text-slate-500">Loading products / جارٍ تحميل المنتجات…</div>
      : products.isError ? <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">Unable to load products / تعذر تحميل المنتجات.</div>
      : visible.length ? <>{view === 'grid'
        ? <ProductGrid products={visible} selectedIds={selectedIds} canAdmin={user?.role === 'ADMIN'} onSelect={(id, selected) => setSelectedIds((current) => { const next = new Set(current); if (selected) next.add(id); else next.delete(id); return next; })} onSelectAll={(selected) => setSelectedIds((current) => { const next = new Set(current); visible.forEach((product) => selected ? next.add(product.id) : next.delete(product.id)); return next; })} onView={(product) => focus(product.id)} onEdit={openEdit} onArchive={openArchive} onRestore={openRestore} />
        : <ProductsTable products={visible} selectedIds={selectedIds} canAdmin={user?.role === 'ADMIN'} onSelect={(id, selected) => setSelectedIds((current) => { const next = new Set(current); if (selected) next.add(id); else next.delete(id); return next; })} onSelectAll={(selected) => setSelectedIds((current) => { const next = new Set(current); visible.forEach((product) => selected ? next.add(product.id) : next.delete(product.id)); return next; })} onView={(product) => focus(product.id)} onEdit={openEdit} onArchive={openArchive} onRestore={openRestore} />}<div className="overflow-hidden rounded-lg border border-slate-200"><Pagination currentPage={filters.page ?? 1} totalPages={products.data?.pagination.totalPages ?? 1} onPageChange={(page) => updateFilters({ page })} /></div></>
      : <div className="rounded-lg border border-dashed border-slate-300 bg-white p-12 text-center"><Package className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 font-medium text-slate-700">{productLabels.noProducts}</p></div>}

    <ProductFormDialog open={formOpen} product={editingProduct} onClose={closeForm} onViewDuplicate={(id) => { closeForm(); focus(id); }} />
    <ProductDetailsDrawer productId={focusedId} onClose={() => focus(null)} onEdit={openEdit} onArchive={openArchive} onRestore={openRestore} />
    <ProductArchiveDialog key={archiveProduct?.id ?? 'archive'} product={archiveProduct} onClose={() => setArchiveProduct(null)} />
    <ProductRestoreDialog key={restoreProduct?.id ?? 'restore'} product={restoreProduct} onClose={() => setRestoreProduct(null)} />
  </div>;
};
