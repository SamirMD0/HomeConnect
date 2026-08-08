import React, { useEffect, useMemo, useRef, useState } from 'react';
import { LayoutGrid, List, Package, Plus, ScanLine } from 'lucide-react';
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
import { productSearchParams, productViewSearchParams, resolveProductView } from '../../features/products/utils/product-view';
import { businessLabels } from '../../shared/labels/business-labels';
import { useAuth } from '../../hooks/useAuth';
import { RecentScansList } from '../../features/scanner/components/RecentScansList';
import { ScanFeedback } from '../../features/scanner/components/ScanFeedback';
import { useRecentScans } from '../../features/scanner/hooks/useRecentScans';
import { useScannerEvents } from '../../features/scanner/hooks/useScannerEvents';
import { useScannerLookup } from '../../features/scanner/hooks/useScannerLookup';
import { toRecentScanFromEvent } from '../../features/scanner/utils/scan-events';
import { shouldRefocusScanInput } from '../../features/scanner/utils/scan-intent';

const SCANNER_MODE_KEY = 'products:scannerMode';

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
  const searchInputRef = useRef<HTMLInputElement>(null);
  const view = resolveProductView(params, typeof window !== 'undefined' ? window.localStorage.getItem('products:view') : null);
  const [scannerMode, setScannerMode] = useState(() =>
    typeof window !== 'undefined' && window.localStorage.getItem(SCANNER_MODE_KEY) === 'on');

  useEffect(() => { const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 300); return () => window.clearTimeout(timer); }, [search]);
  useEffect(() => {
    setParams((current) => productSearchParams(current, debouncedSearch), { replace: true });
  }, [debouncedSearch, setParams]);

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

  const recentScans = useRecentScans();
  const scanner = useScannerLookup({
    onFound: (result) => { if (result.product) focus(result.product.id); },
    onScanRecorded: recentScans.add,
  });

  /**
   * Scanner mode keeps the caret in the scan box, so a burst from the USB
   * scanner cannot land in whatever was clicked last. Real editing still wins:
   * `shouldRefocusScanInput` ignores modifier chords, other fields, and any
   * moment a dialog is open.
   */
  const dialogOpen = formOpen || Boolean(focusedId) || Boolean(archiveProduct) || Boolean(restoreProduct);

  /**
   * Scans made on a paired phone. Recorded into the same list as desk scans;
   * a found product opens here as if it had been scanned at the counter, unless
   * something is already open — a shelf scan must not yank a half-finished edit
   * away from whoever is at the keyboard.
   */
  useScannerEvents({
    enabled: scannerMode,
    canOpenProduct: !dialogOpen,
    onPhoneScan: (event) => recentScans.add(toRecentScanFromEvent(event)),
    onOpenProduct: (productId) => focus(productId),
  });
  useEffect(() => {
    if (!scannerMode || dialogOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target === searchInputRef.current) return;
      const shouldRefocus = shouldRefocusScanInput({
        key: event.key,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        altKey: event.altKey,
        targetTagName: target?.tagName,
        targetIsContentEditable: target?.isContentEditable,
      }, dialogOpen);
      if (shouldRefocus) searchInputRef.current?.focus();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [scannerMode, dialogOpen]);

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
  const applySearchTerm = (value: string) => {
    const next = new URLSearchParams(params); next.set('search', value); next.delete('page'); setParams(next);
    setDebouncedSearch(value);
  };
  /**
   * Submitting the box means "scan this" only when the text could actually be a
   * barcode or SKU. Typed words fall through to the existing search rather than
   * being reported as a failed scan. Either way the list is filtered, so the
   * result stays visible behind the scan feedback.
   */
  const submitScan = () => {
    const intent = scanner.submit(search);
    if (intent.kind === 'SCAN') applySearchTerm(intent.code);
    if (intent.kind === 'SEARCH') applySearchTerm(intent.term);
  };
  const toggleScannerMode = () => {
    setScannerMode((current) => {
      const next = !current;
      window.localStorage.setItem(SCANNER_MODE_KEY, next ? 'on' : 'off');
      if (next) searchInputRef.current?.focus();
      return next;
    });
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
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <button type="button" aria-pressed={scannerMode} onClick={toggleScannerMode} className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold ${scannerMode ? 'border-emerald-600 bg-emerald-50 text-emerald-700' : 'border-slate-300 bg-white text-slate-500'}`}>
          <ScanLine className="h-4 w-4" />{businessLabels.scanner.scannerMode}
        </button>
        <div className="inline-flex rounded-lg border border-slate-300 bg-white p-1" aria-label="Product view / طريقة عرض المنتجات">
          <button type="button" aria-pressed={view === 'table'} onClick={() => setView('table')} className={`inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-semibold ${view === 'table' ? 'bg-emerald-50 text-emerald-700' : 'text-slate-500'}`}><List className="h-4 w-4" />Table / جدول</button>
          <button type="button" aria-pressed={view === 'grid'} onClick={() => setView('grid')} className={`inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-semibold ${view === 'grid' ? 'bg-emerald-50 text-emerald-700' : 'text-slate-500'}`}><LayoutGrid className="h-4 w-4" />Grid / شبكة</button>
        </div>
      </div>
    </div>

    <ProductBulkActionsBar selectedIds={[...selectedIds]} visibleIds={visible.map((product) => product.id)} onClear={() => setSelectedIds(new Set())} />

    <ProductFilters filters={filters} search={search} onSearchChange={(value) => { setSearch(value); scanner.clear(); }} onSearchSubmit={submitScan} searchInputRef={searchInputRef} onChange={updateFilters} />
    <ScanFeedback result={scanner.result} isLooking={scanner.isLooking} isError={scanner.isError} onOpenProduct={focus} />
    {scannerMode && <RecentScansList scans={recentScans.scans} onOpenProduct={focus} onClear={recentScans.clear} />}

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
