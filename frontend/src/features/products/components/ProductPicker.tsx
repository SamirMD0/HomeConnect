import React, { useEffect, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { useCreateProduct, useProducts } from '../hooks/useProducts';
import { CreateProductInput, Product } from '../types/product.types';
import { businessLabels } from '../../../shared/labels/business-labels';

export interface ProductSelection {
  productId: string | null;
  manualProductName: string;
  manualProductModel: string;
  manualProductBrand: string;
  manualProductNotes: string;
}

export const ProductPicker: React.FC<{ value: ProductSelection; onChange: (value: ProductSelection) => void }> = ({ value, onChange }) => {
  const [mode, setMode] = useState<'existing' | 'manual'>(value.productId ? 'existing' : 'manual');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [newProduct, setNewProduct] = useState<CreateProductInput>({ name: '', model: '' });
  const products = useProducts({ search: debouncedSearch, isActive: true, pageSize: 10 });
  const createProduct = useCreateProduct();

  useEffect(() => { const id = window.setTimeout(() => setDebouncedSearch(search.trim()), 300); return () => window.clearTimeout(id); }, [search]);
  const choose = (product: Product) => onChange({ productId: product.id, manualProductName: '', manualProductModel: '', manualProductBrand: '', manualProductNotes: '' });
  const setManual = (field: keyof Omit<ProductSelection, 'productId'>, fieldValue: string) => onChange({ ...value, productId: null, [field]: fieldValue });

  return (
    <fieldset className="space-y-4 rounded-lg border border-slate-200 p-4">
      <legend className="px-2 font-semibold text-slate-800">{businessLabels.service.product}</legend>
      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2"><input type="radio" checked={mode === 'existing'} onChange={() => { setMode('existing'); onChange({ productId: null, manualProductName: '', manualProductModel: '', manualProductBrand: '', manualProductNotes: '' }); }} /> Select Existing / اختيار منتج</label>
        <label className="flex items-center gap-2"><input type="radio" checked={mode === 'manual'} onChange={() => { setMode('manual'); onChange({ productId: null, manualProductName: '', manualProductModel: '', manualProductBrand: '', manualProductNotes: '' }); }} /> Enter Manually / إدخال يدوي</label>
      </div>
      {mode === 'existing' ? (
        <div className="space-y-3">
          <label className="relative block"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search product / بحث عن منتج" className="w-full rounded-lg border border-slate-300 py-2.5 pl-9 pr-3" /></label>
          <div className="max-h-44 divide-y overflow-y-auto rounded-lg border border-slate-200">
            {products.data?.items.map((product) => <button type="button" key={product.id} onClick={() => choose(product)} className={`user-text block w-full px-3 py-2 text-left hover:bg-emerald-50 ${value.productId === product.id ? 'bg-emerald-50 ring-1 ring-inset ring-emerald-300' : ''}`} dir="auto"><span className="font-medium" dir="auto">{product.name}</span><span className="ml-2 text-sm text-slate-500" dir="auto">{product.model}{product.brand ? ` · ${product.brand}` : ''}</span>{product.barcode && <span className="mt-0.5 block font-mono text-xs text-slate-400" dir="ltr">{product.barcode}</span>}</button>)}
            {!products.isLoading && !products.data?.items.length && <p className="p-3 text-sm text-slate-500">No matching products.</p>}
          </div>
          <button type="button" onClick={() => setShowAdd((open) => !open)} className="inline-flex items-center gap-1 text-sm font-medium text-emerald-700"><Plus className="h-4 w-4" /> Add New Product / إضافة منتج</button>
          {showAdd && <div className="grid gap-3 rounded-lg bg-slate-50 p-3 sm:grid-cols-2">
            <input dir="auto" className="user-text-input rounded-lg border border-slate-300 px-3 py-2" placeholder={`${businessLabels.product.name} *`} aria-label={businessLabels.product.name} value={newProduct.name} onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })} />
            <input dir="auto" className="user-text-input rounded-lg border border-slate-300 px-3 py-2" placeholder={`${businessLabels.product.model} *`} aria-label={businessLabels.product.model} value={newProduct.model} onChange={(e) => setNewProduct({ ...newProduct, model: e.target.value })} />
            <input dir="auto" className="user-text-input rounded-lg border border-slate-300 px-3 py-2" placeholder={`${businessLabels.product.brand} (optional / اختياري)`} value={newProduct.brand ?? ''} onChange={(e) => setNewProduct({ ...newProduct, brand: e.target.value })} />
            <input className="rounded-lg border border-slate-300 px-3 py-2" placeholder={`${businessLabels.product.barcode} (optional / اختياري)`} value={newProduct.barcode ?? ''} onChange={(e) => setNewProduct({ ...newProduct, barcode: e.target.value })} />
            <input className="rounded-lg border border-slate-300 px-3 py-2" placeholder={`${businessLabels.product.price} (optional / اختياري)`} value={newProduct.price ?? ''} onChange={(e) => setNewProduct({ ...newProduct, price: e.target.value })} />
            <button type="button" disabled={!newProduct.name.trim() || !newProduct.model.trim() || createProduct.isPending} onClick={() => createProduct.mutate(newProduct, { onSuccess: (product) => { choose(product); setShowAdd(false); } })} className="rounded-lg bg-emerald-600 px-3 py-2 font-medium text-white disabled:opacity-50">Save and Select / حفظ واختيار</button>
          </div>}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <input required dir="auto" className="user-text-input rounded-lg border border-slate-300 px-3 py-2" placeholder={`${businessLabels.product.name} *`} value={value.manualProductName} onChange={(e) => setManual('manualProductName', e.target.value)} />
          <input dir="auto" className="user-text-input rounded-lg border border-slate-300 px-3 py-2" placeholder={businessLabels.product.model} value={value.manualProductModel} onChange={(e) => setManual('manualProductModel', e.target.value)} />
          <input dir="auto" className="user-text-input rounded-lg border border-slate-300 px-3 py-2" placeholder={businessLabels.product.brand} value={value.manualProductBrand} onChange={(e) => setManual('manualProductBrand', e.target.value)} />
          <input dir="auto" className="user-text-input rounded-lg border border-slate-300 px-3 py-2" placeholder="Product Notes / ملاحظات المنتج" value={value.manualProductNotes} onChange={(e) => setManual('manualProductNotes', e.target.value)} />
        </div>
      )}
    </fieldset>
  );
};
