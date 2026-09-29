import React, { useEffect, useMemo, useRef, useState } from 'react';
import { LayoutGrid, List, Package, Plus, ScanLine, Tags } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button, buttonClasses } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { PageHeader } from '../../components/ui/PageHeader';
import { Pagination } from '../../components/ui/Pagination';
import { SkeletonTable } from '../../components/ui/Skeleton';
import { ProductArchiveDialog } from '../../features/products/components/ProductArchiveDialog';
import { ProductBulkActionsBar } from '../../features/products/components/ProductBulkActionsBar';
import { ProductDetailsDrawer } from '../../features/products/components/ProductDetailsDrawer';
import { ProductFilters, hasActiveProductFilters, productFilterResetPatch } from '../../features/products/components/ProductFilters';
import { ProductFormDialog } from '../../features/products/components/ProductFormDialog';
import { ProductGrid, ProductGridSkeleton } from '../../features/products/components/ProductGrid';
import { ProductRestoreDialog } from '../../features/products/components/ProductRestoreDialog';
import { ProductStats } from '../../features/products/components/ProductStats';
import { ProductsTable } from '../../features/products/components/ProductsTable';
import { useProductBrands, useProducts } from '../../features/products/hooks/useProducts';
import { useCategories } from '../../features/categories/categories';
import { Product, ProductFilterPatch, ProductFilters as ProductFilterValues, ProductSortBy, ProductSortOrder, ProductStockFilter } from '../../features/products/types/product.types';
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
    categoryId: params.get('categoryId') || undefined,
    hasBarcode: params.has('hasBarcode') ? params.get('hasBarcode') === 'true' : undefined,
    trackStock: params.has('trackStock') ? params.get('trackStock') === 'true' : undefined,
    stockStatus: (params.get('stockStatus') as ProductStockFilter | null) ?? undefined,
    sortBy: (params.get('sortBy') as ProductSortBy | null) ?? 'name',
    sortOrder: (params.get('sortOrder') as ProductSortOrder | null) ?? 'asc',
    page: Math.max(1, Number(params.get('page') || 1)),
    pageSize: resolveProductPageSize(params.get('pageSize')),
  }), [params]);
  const products = useProducts(filters);
  const brands = useProductBrands();
  const categories = useCategories();
  const focusedId = params.get('focus');
  const focusedSection = params.get('section') === 'stock' ? 'stock' : undefined;

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

  /**
   * Patch keys are URL parameter names, so every filter survives a reload, a
   * back button, and a bookmarked "what do I need to reorder" link. `isActive`
   * is excluded by `ProductFilterPatch` because it lives in the `status` tab.
   */
  const updateFilters = (patch: ProductFilterPatch) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined || value === '') next.delete(key);
      else next.set(key, String(value));
    }
    setParams(next);
  };
  const resetFilters = () => {
    setSearch('');
    setDebouncedSearch('');
    updateFilters(productFilterResetPatch());
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
  const focus = (id: string | null, section?: 'stock') => setParams(productFocusSearchParams(params, id, section), { replace: true });
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

  const canAdmin = user?.role === 'ADMIN';
  const filtersActive = hasActiveProductFilters(filters, search);
  const toggleSelected = (id: string, selected: boolean) => setSelectedIds((current) => {
    const next = new Set(current);
    if (selected) next.add(id); else next.delete(id);
    return next;
  });
  const toggleSelectedPage = (selected: boolean) => setSelectedIds((current) => {
    const next = new Set(current);
    visible.forEach((product) => selected ? next.add(product.id) : next.delete(product.id));
    return next;
  });
  const listProps = {
    products: visible,
    selectedIds,
    canAdmin,
    onSelect: toggleSelected,
    onSelectAll: toggleSelectedPage,
    onView: (product: Product) => focus(product.id),
    onEdit: openEdit,
    onInventory: (product: Product) => focus(product.id, 'stock'),
    onArchive: openArchive,
    onRestore: openRestore,
  };

  return <div className="space-y-5">
    <PageHeader
      icon={<Package />}
      title={businessLabels.product.products}
      description="Manage the product catalogue and printable labels / إدارة دليل المنتجات والملصقات."
      actions={<>
        <Link to="/products/brands" className={buttonClasses('secondary', 'md')}><Tags className="h-4 w-4" />Brands / الماركات</Link>
        <Link to="/products/categories" className={buttonClasses('secondary', 'md')}><Tags className="h-4 w-4" />Categories</Link>
        <Button icon={<Plus />} onClick={() => { setEditingProduct(null); setFormOpen(true); }}>{businessLabels.product.addProduct}</Button>
      </>}
    />

    <ProductStats totalMatching={products.data?.pagination.totalItems} filters={filters} onFilter={updateFilters} />

    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200">
      <div className="flex gap-1">
        <StatusTab active={Boolean(filters.isActive)} onClick={() => setStatus('active')}>{productLabels.activeProducts}</StatusTab>
        <StatusTab active={!filters.isActive} onClick={() => setStatus('archived')}>{productLabels.archivedProducts}</StatusTab>
      </div>
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <Button
          variant={scannerMode ? 'secondary' : 'ghost'}
          icon={<ScanLine />}
          aria-pressed={scannerMode}
          onClick={toggleScannerMode}
          className={scannerMode ? 'border-brand-600 bg-brand-50 text-brand-700 hover:bg-brand-100' : undefined}
        >
          {businessLabels.scanner.scannerMode}
        </Button>
        <div className="inline-flex rounded-lg border border-slate-300 bg-white p-1" role="group" aria-label="Product view / طريقة عرض المنتجات">
          <ViewTab active={view === 'table'} onClick={() => setView('table')} icon={<List className="h-4 w-4" />}>Table / جدول</ViewTab>
          <ViewTab active={view === 'grid'} onClick={() => setView('grid')} icon={<LayoutGrid className="h-4 w-4" />}>Grid / شبكة</ViewTab>
        </div>
      </div>
    </div>

    <ProductBulkActionsBar selectedIds={[...selectedIds]} visibleIds={visible.map((product) => product.id)} onClear={() => setSelectedIds(new Set())} />

    <ProductFilters
      categories={categories.data}
      categoriesLoading={categories.isLoading}
      filters={filters}
      search={search}
      onSearchChange={(value) => { setSearch(value); scanner.clear(); }}
      onSearchSubmit={submitScan}
      onReset={resetFilters}
      searchInputRef={searchInputRef}
      onChange={updateFilters}
      brands={brands.data}
      brandsLoading={brands.isLoading}
      isFetching={products.isFetching}
      resultCount={products.data?.pagination.totalItems}
    />
    <ScanFeedback result={scanner.result} isLooking={scanner.isLooking} isError={scanner.isError} onOpenProduct={focus} />
    {scannerMode && <RecentScansList scans={recentScans.scans} onOpenProduct={focus} onClear={recentScans.clear} />}

    {products.isLoading
      ? <ProductsLoadingState view={view} />
      : products.isError
        ? <ProductsErrorState onRetry={() => products.refetch()} />
        : visible.length
          ? <>
              {view === 'grid' ? <ProductGrid {...listProps} /> : <ProductsTable {...listProps} />}
              <Card variant="flush"><Pagination currentPage={filters.page ?? 1} totalPages={products.data?.pagination.totalPages ?? 1} onPageChange={(page) => updateFilters({ page })} /></Card>
            </>
          : <ProductsEmptyState
              filtersActive={filtersActive}
              archived={!filters.isActive}
              onReset={resetFilters}
              onAdd={() => { setEditingProduct(null); setFormOpen(true); }}
            />}

    <ProductFormDialog open={formOpen} product={editingProduct} onClose={closeForm} onViewDuplicate={(id) => { closeForm(); focus(id); }} />
    <ProductDetailsDrawer productId={focusedId} initialSection={focusedSection} onClose={() => focus(null)} onEdit={openEdit} onArchive={openArchive} onRestore={openRestore} />
    <ProductArchiveDialog key={archiveProduct?.id ?? 'archive'} product={archiveProduct} onClose={() => setArchiveProduct(null)} />
    <ProductRestoreDialog key={restoreProduct?.id ?? 'restore'} product={restoreProduct} onClose={() => setRestoreProduct(null)} />
  </div>;
};

const StatusTab: React.FC<{ active: boolean; onClick: () => void; children: React.ReactNode }> = ({ active, onClick, children }) => (
  <button
    type="button"
    aria-pressed={active}
    onClick={onClick}
    className={`border-b-2 px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 ${
      active ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-800'
    }`}
  >
    {children}
  </button>
);

const ViewTab: React.FC<{ active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }> = ({ active, onClick, icon, children }) => (
  <button
    type="button"
    aria-pressed={active}
    onClick={onClick}
    className={`inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 ${
      active ? 'bg-brand-50 text-brand-700' : 'text-slate-500 hover:text-slate-800'
    }`}
  >
    {icon}{children}
  </button>
);

/**
 * Three different nothings, because they need three different next steps:
 * a filter that matched nothing needs a way out, an empty catalogue needs a
 * first product, and an empty archive is simply good news.
 */
export const ProductsEmptyState: React.FC<{
  filtersActive: boolean;
  archived: boolean;
  onReset: () => void;
  onAdd: () => void;
}> = ({ filtersActive, archived, onReset, onAdd }) => {
  if (filtersActive) {
    return <EmptyState
      icon={<Package className="h-8 w-8 text-slate-300" />}
      title={productLabels.noProducts}
      description={productLabels.noProductsHint}
      action={<Button variant="secondary" onClick={onReset}>{productLabels.resetFilters}</Button>}
    />;
  }
  if (archived) {
    return <EmptyState
      icon={<Package className="h-8 w-8 text-slate-300" />}
      title={productLabels.noArchivedProducts}
      description={productLabels.noArchivedProductsHint}
    />;
  }
  return <EmptyState
    icon={<Package className="h-8 w-8 text-slate-300" />}
    title={productLabels.emptyCatalogue}
    description={productLabels.emptyCatalogueHint}
    action={<Button icon={<Plus />} onClick={onAdd}>{businessLabels.product.addProduct}</Button>}
  />;
};

export const ProductsLoadingState: React.FC<{ view: 'table' | 'grid' }> = ({ view }) => (
  view === 'grid'
    ? <ProductGridSkeleton />
    : <Card variant="flush" aria-label="Loading products / جارٍ تحميل المنتجات"><SkeletonTable rows={8} columns={6} /></Card>
);

export const ProductsErrorState: React.FC<{ onRetry: () => void }> = ({ onRetry }) => (
  <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
    <span className="min-w-0 flex-1">{productLabels.loadFailed}</span>
    <Button variant="secondary" size="sm" onClick={onRetry}>{productLabels.retry}</Button>
  </div>
);

const PRODUCT_PAGE_SIZES = [25, 50, 100];

/** A hand-edited `?pageSize=` must not reach the backend's 100 cap as a 400. */
export const resolveProductPageSize = (raw: string | null): number => {
  const value = Number(raw);
  return PRODUCT_PAGE_SIZES.includes(value) ? value : PRODUCT_PAGE_SIZES[0];
};

export const productFocusSearchParams = (current: URLSearchParams, id: string | null, section?: 'stock') => {
  const next = new URLSearchParams(current);
  if (id) next.set('focus', id); else next.delete('focus');
  if (id && section) next.set('section', section); else next.delete('section');
  return next;
};
