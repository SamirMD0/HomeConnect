import React, { useMemo, useState } from 'react';
import { Check, Plus, X } from 'lucide-react';
import { Button, Card } from '../../../components/ui';
import { businessLabels } from '../../../shared/labels/business-labels';
import { useProductInventory } from '../../inventory/hooks/useInventory';
import { useCreateProduct } from '../hooks/useProducts';
import { useProductSearch } from '../hooks/useProductSearch';
import type { CreateProductInput, Product } from '../types/product.types';
import { ProductSearchInput } from './ProductSearchInput';

export interface ProductSelection {
  productId: string | null;
  manualProductName: string;
  manualProductModel: string;
  manualProductBrand: string;
  manualProductNotes: string;
}

interface LegacyProps {
  value: ProductSelection;
  onChange: (value: ProductSelection) => void;
}

export interface CatalogProductPickerProps {
  selectedProductId: string | null;
  onSelect: (product: Product | null) => void;
  requireOpeningCount?: boolean;
  disabledProductIds?: ReadonlySet<string>;
}

export const ProductPicker: React.FC<LegacyProps | CatalogProductPickerProps> = (props) => (
  'value' in props ? <LegacyProductPicker {...props} /> : <CatalogProductPicker {...props} />
);

const CatalogProductPicker: React.FC<CatalogProductPickerProps> = (props) => {
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const search = useProductSearch({ isActive: true, sortBy: 'name', sortOrder: 'asc', limit: 10 });
  const products = useMemo(() => search.products.data?.items ?? [], [search.products.data?.items]);
  const selected = selectedProduct?.id === props.selectedProductId
    ? selectedProduct
    : products.find((product) => product.id === props.selectedProductId) ?? null;

  const choose = (product: Product | null) => {
    setSelectedProduct(product);
    props.onSelect(product);
  };
  return <div className="space-y-3">
    <ProductSearchInput value={search.query} onChange={search.setQuery} isLoading={search.products.isFetching} resultCount={products.length} />
    {selected && <Card dense className="flex items-center justify-between gap-3 border-emerald-200 bg-emerald-50">
      <ProductSummary product={selected} />
      <Button type="button" variant="ghost" size="sm" icon={<X />} onClick={() => choose(null)}>Clear / مسح</Button>
    </Card>}
    <div className="max-h-52 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
      {products.map((product) => props.requireOpeningCount && product.trackStock
        ? <OpeningCountProductResult key={product.id} product={product} duplicate={Boolean(props.disabledProductIds?.has(product.id))} selected={props.selectedProductId === product.id} onSelect={choose} />
        : <ProductResult key={product.id} product={product} reason={props.disabledProductIds?.has(product.id)
          ? 'Already selected / تم اختيار المنتج مسبقًا'
          : props.requireOpeningCount ? 'Needs a verified opening count / يحتاج جردًا افتتاحيًا مؤكدًا' : null} selected={props.selectedProductId === product.id} onSelect={choose} />)}
      {search.products.isLoading && <p className="p-3 text-sm text-slate-500">Loading products… / جارٍ تحميل المنتجات…</p>}
      {search.products.isError && <div role="alert" className="flex items-center justify-between gap-2 p-3 text-sm text-red-700">
        <span>Unable to search products / تعذر البحث عن المنتجات</span>
        <Button type="button" size="sm" variant="ghost" onClick={() => search.products.refetch()}>Retry / إعادة المحاولة</Button>
      </div>}
      {!search.products.isLoading && !search.products.isError && products.length === 0 && <p className="p-3 text-sm text-slate-500">
        No products match{search.debouncedQuery ? ` “${search.debouncedQuery}”` : ''} / لا توجد منتجات مطابقة
      </p>}
    </div>
  </div>;
};

const LegacyProductPicker: React.FC<LegacyProps> = ({ value, onChange }) => {
  const [mode, setMode] = useState<'existing' | 'manual'>(value.productId ? 'existing' : 'manual');
  const [showAdd, setShowAdd] = useState(false);
  const [newProduct, setNewProduct] = useState<CreateProductInput>({ name: '', model: '' });
  const createProduct = useCreateProduct();
  const choose = (product: Product | null) => onChange({
    productId: product?.id ?? null,
    manualProductName: '',
    manualProductModel: '',
    manualProductBrand: '',
    manualProductNotes: '',
  });
  const setManual = (field: keyof Omit<ProductSelection, 'productId'>, fieldValue: string) => onChange({ ...value, productId: null, [field]: fieldValue });

  return <fieldset className="space-y-4 rounded-lg border border-slate-200 p-4">
    <legend className="px-2 font-semibold text-slate-800">{businessLabels.service.product}</legend>
    <div className="flex flex-wrap gap-4 text-sm">
      <label className="flex items-center gap-2"><input type="radio" checked={mode === 'existing'} onChange={() => { setMode('existing'); choose(null); }} /> Select Existing / اختيار منتج</label>
      <label className="flex items-center gap-2"><input type="radio" checked={mode === 'manual'} onChange={() => { setMode('manual'); choose(null); }} /> Enter Manually / إدخال يدوي</label>
    </div>
    {mode === 'existing' ? <div className="space-y-3">
      <CatalogProductPicker selectedProductId={value.productId} onSelect={choose} />
      <button type="button" onClick={() => setShowAdd((open) => !open)} className="inline-flex items-center gap-1 text-sm font-medium text-emerald-700"><Plus className="h-4 w-4" /> Add New Product / إضافة منتج</button>
      {showAdd && <div className="grid gap-3 rounded-lg bg-slate-50 p-3 sm:grid-cols-2">
        <input dir="auto" className="user-text-input rounded-lg border border-slate-300 px-3 py-2" placeholder={`${businessLabels.product.name} *`} aria-label={businessLabels.product.name} value={newProduct.name} onChange={(event) => setNewProduct({ ...newProduct, name: event.target.value })} />
        <input dir="auto" className="user-text-input rounded-lg border border-slate-300 px-3 py-2" placeholder={`${businessLabels.product.model} *`} aria-label={businessLabels.product.model} value={newProduct.model} onChange={(event) => setNewProduct({ ...newProduct, model: event.target.value })} />
        <input dir="auto" className="user-text-input rounded-lg border border-slate-300 px-3 py-2" placeholder={`${businessLabels.product.brand} (optional / اختياري)`} value={newProduct.brand ?? ''} onChange={(event) => setNewProduct({ ...newProduct, brand: event.target.value })} />
        <input className="rounded-lg border border-slate-300 px-3 py-2" placeholder={`${businessLabels.product.barcode} (optional / اختياري)`} value={newProduct.barcode ?? ''} onChange={(event) => setNewProduct({ ...newProduct, barcode: event.target.value })} />
        <input className="rounded-lg border border-slate-300 px-3 py-2" placeholder={`${businessLabels.product.price} (optional / اختياري)`} value={newProduct.price ?? ''} onChange={(event) => setNewProduct({ ...newProduct, price: event.target.value })} />
        <button type="button" disabled={!newProduct.name.trim() || !newProduct.model.trim() || createProduct.isPending} onClick={() => createProduct.mutate(newProduct, { onSuccess: (product) => { choose(product); setShowAdd(false); } })} className="rounded-lg bg-emerald-600 px-3 py-2 font-medium text-white disabled:opacity-50">Save and Select / حفظ واختيار</button>
      </div>}
    </div> : <div className="grid gap-3 sm:grid-cols-2">
      <input required dir="auto" className="user-text-input rounded-lg border border-slate-300 px-3 py-2" placeholder={`${businessLabels.product.name} *`} value={value.manualProductName} onChange={(event) => setManual('manualProductName', event.target.value)} />
      <input dir="auto" className="user-text-input rounded-lg border border-slate-300 px-3 py-2" placeholder={businessLabels.product.model} value={value.manualProductModel} onChange={(event) => setManual('manualProductModel', event.target.value)} />
      <input dir="auto" className="user-text-input rounded-lg border border-slate-300 px-3 py-2" placeholder={businessLabels.product.brand} value={value.manualProductBrand} onChange={(event) => setManual('manualProductBrand', event.target.value)} />
      <input dir="auto" className="user-text-input rounded-lg border border-slate-300 px-3 py-2" placeholder="Product Notes / ملاحظات المنتج" value={value.manualProductNotes} onChange={(event) => setManual('manualProductNotes', event.target.value)} />
    </div>}
  </fieldset>;
};

const ProductSummary: React.FC<{ product: Product }> = ({ product }) => <div>
  <p className="user-text font-semibold" dir="auto">{product.name}</p>
  <p className="text-xs text-slate-600">{product.model} · {product.sku}{product.barcode ? ` · ${product.barcode}` : ''}</p>
  {product.trackStock && <p className="text-xs text-slate-600">In stock: {product.stockQuantity} / المتوفر: {product.stockQuantity}</p>}
</div>;

const OpeningCountProductResult: React.FC<{
  product: Product;
  duplicate: boolean;
  selected: boolean;
  onSelect: (product: Product) => void;
}> = ({ product, duplicate, selected, onSelect }) => {
  const inventory = useProductInventory(product.id);
  const reason = duplicate
    ? 'Already selected / تم اختيار المنتج مسبقًا'
    : inventory.isLoading
      ? 'Checking inventory eligibility… / جارٍ التحقق من أهلية المخزون…'
      : inventory.isError
        ? 'Unable to verify inventory eligibility / تعذر التحقق من أهلية المخزون'
        : inventory.data?.onboardingStatus !== 'ONBOARDED'
          ? 'Needs a verified opening count / يحتاج جردًا افتتاحيًا مؤكدًا'
          : null;
  return <ProductResult product={product} reason={reason} selected={selected} onSelect={onSelect} />;
};

const ProductResult: React.FC<{
  product: Product;
  reason: string | null;
  selected: boolean;
  onSelect: (product: Product) => void;
}> = ({ product, reason, selected, onSelect }) => <button
  type="button"
  disabled={Boolean(reason)}
  onClick={() => onSelect(product)}
  className="flex w-full items-start justify-between gap-3 px-3 py-2 text-left hover:bg-emerald-50 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
>
  <span>
    <span className="user-text block font-medium" dir="auto">{product.name}</span>
    <span className="text-xs">{product.model} · {product.sku}{product.barcode ? ` · ${product.barcode}` : ''}</span>
    {reason && <span className="block text-xs font-semibold text-amber-700">{reason}</span>}
  </span>
  <span className="shrink-0 text-xs text-slate-500">
    {product.trackStock ? `${product.stockQuantity} in stock` : 'Not tracked'}
    {selected && <Check className="ml-auto mt-1 h-4 w-4 text-emerald-700" />}
  </span>
</button>;
