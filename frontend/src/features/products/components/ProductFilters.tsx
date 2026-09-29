import React, { useId, useState } from 'react';
import { Loader2, RotateCcw, ScanLine, SlidersHorizontal, X } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { controlClasses } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import {
  ProductBrandSummary,
  ProductFilterPatch,
  ProductFilters as ProductFilterValues,
  ProductSortBy,
  ProductSortOrder,
  ProductStockFilter,
} from '../types/product.types';
import { productLabels } from '../utils/product-labels';
import { CategorySelect } from '../../categories/CategorySelect';
import type { Category } from '../../categories/categories';

export interface ProductFiltersProps {
  filters: ProductFilterValues;
  search: string;
  onSearchChange: (value: string) => void;
  onChange: (patch: ProductFilterPatch) => void;
  onSearchSubmit: () => void;
  onReset: () => void;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  brands?: ProductBrandSummary[];
  categories?: Category[];
  categoriesLoading?: boolean;
  brandsLoading?: boolean;
  /** A refetch is in flight — shown in the search box, not as a page-wide spinner. */
  isFetching?: boolean;
  /** Total matching the current filters, across all pages. */
  resultCount?: number;
}

export const productBrandFilterPatch = (value: string): ProductFilterPatch => ({
  brand: value || undefined,
  page: 1,
});

/**
 * Everything the toolbar owns, back to defaults. `status` and `view` are
 * deliberately absent: the archived tab and the table/grid choice are how the
 * operator is looking at the catalogue, not what they filtered it down to, and
 * resetting those would feel like the page threw their place away.
 */
export const productFilterResetPatch = (): ProductFilterPatch => ({
  search: undefined,
  brand: undefined,
  categoryId: undefined,
  hasBarcode: undefined,
  trackStock: undefined,
  stockStatus: undefined,
  sortBy: undefined,
  sortOrder: undefined,
  page: undefined,
});

export const hasActiveProductFilters = (filters: ProductFilterValues, search: string): boolean =>
  Boolean(search.trim())
  || Boolean(filters.brand)
  || Boolean(filters.categoryId)
  || filters.hasBarcode !== undefined
  || filters.trackStock !== undefined
  || filters.stockStatus !== undefined
  || (filters.sortBy !== undefined && filters.sortBy !== 'name')
  || (filters.sortOrder !== undefined && filters.sortOrder !== 'asc');

/**
 * Sort is one control, not two.
 *
 * A field select plus a direction select makes the operator compose "Name" and
 * "Descending" to reach "Z → A", and offers meaningless pairs like "Recently
 * added, ascending". Pairing them into named options costs one row of code and
 * removes a whole decision.
 */
export const PRODUCT_SORT_OPTIONS: Array<{
  value: string;
  label: string;
  sortBy: ProductSortBy;
  sortOrder: ProductSortOrder;
}> = [
  { value: 'name:asc', label: 'Name A → Z / الاسم أ ← ي', sortBy: 'name', sortOrder: 'asc' },
  { value: 'name:desc', label: 'Name Z → A / الاسم ي ← أ', sortBy: 'name', sortOrder: 'desc' },
  { value: 'brand:asc', label: 'Brand A → Z / الماركة أ ← ي', sortBy: 'brand', sortOrder: 'asc' },
  { value: 'model:asc', label: 'Model A → Z / الموديل أ ← ي', sortBy: 'model', sortOrder: 'asc' },
  { value: 'stock:asc', label: 'Stock: lowest first / المخزون: الأقل أولاً', sortBy: 'stock', sortOrder: 'asc' },
  { value: 'stock:desc', label: 'Stock: highest first / المخزون: الأكثر أولاً', sortBy: 'stock', sortOrder: 'desc' },
  { value: 'price:desc', label: 'Manual price: high → low / السعر اليدوي: الأعلى', sortBy: 'price', sortOrder: 'desc' },
  { value: 'price:asc', label: 'Manual price: low → high / السعر اليدوي: الأقل', sortBy: 'price', sortOrder: 'asc' },
  { value: 'updatedAt:desc', label: 'Recently updated / المعدل حديثاً', sortBy: 'updatedAt', sortOrder: 'desc' },
  { value: 'createdAt:desc', label: 'Recently added / المضاف حديثاً', sortBy: 'createdAt', sortOrder: 'desc' },
];

export const productSortValue = (filters: ProductFilterValues): string => {
  const candidate = `${filters.sortBy ?? 'name'}:${filters.sortOrder ?? 'asc'}`;
  return PRODUCT_SORT_OPTIONS.some((option) => option.value === candidate) ? candidate : 'name:asc';
};

export const productSortPatch = (value: string): ProductFilterPatch => {
  const option = PRODUCT_SORT_OPTIONS.find((entry) => entry.value === value) ?? PRODUCT_SORT_OPTIONS[0];
  return { sortBy: option.sortBy, sortOrder: option.sortOrder, page: 1 };
};

export const PRODUCT_STOCK_FILTER_OPTIONS: Array<{ value: ProductStockFilter; label: string }> = [
  { value: 'IN_STOCK', label: 'In stock / متوفر' },
  { value: 'LOW_STOCK', label: 'Low stock / مخزون منخفض' },
  { value: 'OUT_OF_STOCK', label: 'Out of stock / نفد المخزون' },
  { value: 'NOT_TRACKED', label: 'Not tracked / غير متتبع' },
  { value: 'NOT_IN_INVENTORY', label: 'Not in inventory / خارج المخزون' },
];

const PAGE_SIZE_OPTIONS = [25, 50, 100];

export const ProductFilters: React.FC<ProductFiltersProps> = ({
  filters, search, onSearchChange, onChange, onSearchSubmit, onReset, searchInputRef,
  brands = [], brandsLoading = false, categories = [], categoriesLoading = false, isFetching = false, resultCount,
}) => {
  const [advancedOpen, setAdvancedOpen] = useState(
    filters.hasBarcode !== undefined || filters.trackStock !== undefined
  );
  const advancedId = useId();
  return <ProductFiltersView
    filters={filters}
    search={search}
    onSearchChange={onSearchChange}
    onChange={onChange}
    onSearchSubmit={onSearchSubmit}
    onReset={onReset}
    searchInputRef={searchInputRef}
    brands={brands}
    brandsLoading={brandsLoading}
    categories={categories}
    categoriesLoading={categoriesLoading}
    isFetching={isFetching}
    resultCount={resultCount}
    advancedOpen={advancedOpen}
    advancedId={advancedId}
    onToggleAdvanced={() => setAdvancedOpen((current) => !current)}
  />;
};

export const ProductFiltersView: React.FC<ProductFiltersProps & {
  advancedOpen: boolean;
  advancedId: string;
  onToggleAdvanced: () => void;
}> = ({
  filters, search, onSearchChange, onChange, onSearchSubmit, onReset, searchInputRef,
  brands = [], brandsLoading = false, categories = [], categoriesLoading = false, isFetching = false, resultCount,
  advancedOpen, advancedId, onToggleAdvanced,
}) => {
  const canReset = hasActiveProductFilters(filters, search);

  return (
    <section aria-label="Product filters / تصفية المنتجات" className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative min-w-0 flex-1">
          <label className="sr-only" htmlFor={`${advancedId}-search`}>Search products / بحث عن المنتجات</label>
          <ScanLine className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-600" aria-hidden="true" />
          <input
            id={`${advancedId}-search`}
            ref={searchInputRef}
            type="text"
            dir="auto"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); onSearchSubmit(); } }}
            placeholder={productLabels.searchPlaceholder}
            className={controlClasses(false, 'user-text-input pl-9 pr-16')}
          />
          <span className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
            {isFetching && <Loader2 className="h-4 w-4 animate-spin text-slate-400 motion-reduce:animate-none" aria-hidden="true" />}
            {search && (
              <button
                type="button"
                onClick={() => onSearchChange('')}
                aria-label="Clear search / مسح البحث"
                title="Clear search / مسح البحث"
                className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </span>
        </div>

        <Select
          aria-label="Sort products / ترتيب المنتجات"
          value={productSortValue(filters)}
          onChange={(event) => onChange(productSortPatch(event.target.value))}
          className="lg:w-64"
        >
          {PRODUCT_SORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </Select>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="w-72"><CategorySelect categories={categories} value={filters.categoryId ?? ''} onChange={(value) => onChange({ categoryId: value || undefined, page: 1 })} filter loading={categoriesLoading} /></div>
        <Select
          aria-label="Filter by brand / تصفية حسب الماركة"
          value={filters.brand ?? ''}
          onChange={(event) => onChange(productBrandFilterPatch(event.target.value))}
          className="w-52"
          dir="auto"
        >
          <option value="">{brandsLoading ? 'Loading brands… / جارٍ تحميل الماركات…' : 'All brands / كل الماركات'}</option>
          {filters.brand && !brands.some((brand) => brand.canonical === filters.brand) && <option value={filters.brand}>{filters.brand}</option>}
          {brands.map((brand) => <option key={brand.canonical} value={brand.canonical}>{brand.canonical} ({brand.productCount})</option>)}
        </Select>

        <Select
          aria-label="Filter by stock status / تصفية حسب حالة المخزون"
          value={filters.stockStatus ?? ''}
          onChange={(event) => onChange({ stockStatus: (event.target.value || undefined) as ProductStockFilter | undefined, page: 1 })}
          className="w-52"
        >
          <option value="">{productLabels.anyStockStatus}</option>
          {PRODUCT_STOCK_FILTER_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </Select>

        <Button
          variant="ghost"
          size="md"
          icon={<SlidersHorizontal />}
          aria-expanded={advancedOpen}
          aria-controls={advancedId}
          onClick={onToggleAdvanced}
        >
          {productLabels.moreFilters}
        </Button>

        {canReset && (
          <Button variant="link" icon={<RotateCcw />} onClick={onReset}>{productLabels.resetFilters}</Button>
        )}

        <span className="ms-auto text-xs text-slate-500" aria-live="polite">
          {resultCount === undefined ? '' : `${resultCount} ${resultCount === 1 ? 'product' : 'products'} / منتج`}
        </span>
      </div>

      {advancedOpen && (
        <div id={advancedId} className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
          <Select
            aria-label="Filter by barcode / تصفية حسب الباركود"
            value={filters.hasBarcode === undefined ? '' : String(filters.hasBarcode)}
            onChange={(event) => onChange({ hasBarcode: event.target.value === '' ? undefined : event.target.value === 'true', page: 1 })}
            className="w-52"
          >
            <option value="">{productLabels.anyBarcode}</option>
            <option value="true">{productLabels.withBarcode}</option>
            <option value="false">{productLabels.withoutBarcode}</option>
          </Select>

          <Select
            aria-label="Filter by stock tracking / تصفية حسب تتبع المخزون"
            value={filters.trackStock === undefined ? '' : String(filters.trackStock)}
            onChange={(event) => onChange({ trackStock: event.target.value === '' ? undefined : event.target.value === 'true', page: 1 })}
            className="w-52"
          >
            <option value="">{productLabels.anyTracking}</option>
            <option value="true">{productLabels.tracked}</option>
            <option value="false">{productLabels.untracked}</option>
          </Select>

          <Select
            aria-label="Products per page / عدد المنتجات في الصفحة"
            value={String(filters.pageSize ?? PAGE_SIZE_OPTIONS[0])}
            onChange={(event) => onChange({ pageSize: Number(event.target.value), page: 1 })}
            className="w-44"
          >
            {PAGE_SIZE_OPTIONS.map((size) => <option key={size} value={size}>{size} per page / في الصفحة</option>)}
          </Select>
        </div>
      )}
    </section>
  );
};
