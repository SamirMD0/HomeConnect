import { AlertTriangle, PackageSearch } from 'lucide-react';
import { useState } from 'react';
import { Badge, Button, FormField, Input } from '../../../components/ui';
import { ProductPicker } from '../../products/components/ProductPicker';
import type { Product } from '../../products/types/product.types';
import type { SalesOrderLineInput } from '../types/sales-orders.types';

export function salesLineForProduct(value: SalesOrderLineInput, product: Product | null): SalesOrderLineInput {
  if (!product) return { ...value, productId: null, manualProductName: '', manualProductModel: '' };
  const suggestedPrice = product.pricing?.pricingAvailable
    ? product.pricing.cashPrice
    : product.netPrice ?? product.price ?? '0.00';
  return { ...value, productId: product.id, manualProductName: null, manualProductModel: null, unitPrice: suggestedPrice };
}

export function ProductLinePicker({ value, onChange }: { value: SalesOrderLineInput; onChange: (value: SalesOrderLineInput) => void }) {
  const [product, setProduct] = useState<Product | null>(null);
  const selectProduct = (selected: Product | null) => {
    setProduct(selected);
    onChange(salesLineForProduct(value, selected));
  };
  return <div className="grid gap-3 sm:grid-cols-2">
    <div className="sm:col-span-2"><FormField label="Catalog product / منتج من الكتالوج" hint="Search by name, model, SKU or barcode / ابحث بالاسم أو الموديل أو الرمز أو الباركود">{() => <ProductPicker selectedProductId={value.productId ?? null} onSelect={selectProduct} />}</FormField></div>
    {!value.productId && <FormField label="Manual product name / اسم المنتج" required>{(field) => <Input {...field} userText value={value.manualProductName ?? ''} onChange={(event) => onChange({ ...value, manualProductName: event.target.value })} />}</FormField>}
    {!value.productId && <FormField label="Manual model / الموديل">{(field) => <Input {...field} userText value={value.manualProductModel ?? ''} onChange={(event) => onChange({ ...value, manualProductModel: event.target.value })} />}</FormField>}
    <FormField label="Quantity / الكمية" required>{(field) => <Input {...field} numeric type="number" min={1} max={999} value={value.quantity} onChange={(event) => onChange({ ...value, quantity: Math.max(1, Number.parseInt(event.target.value || '1', 10)) })} />}</FormField>
    <FormField label="Unit price / سعر الوحدة" required>{(field) => <Input {...field} numeric inputMode="decimal" value={value.unitPrice} onChange={(event) => onChange({ ...value, unitPrice: event.target.value })} />}</FormField>
    {product?.trackStock && <div className="flex items-end"><Badge tone={product.stockQuantity <= 0 ? 'warning' : 'info'} icon={product.stockQuantity < value.quantity ? <AlertTriangle /> : <PackageSearch />}>In stock: {product.stockQuantity}{product.stockQuantity < value.quantity ? ' · selling above stock is allowed' : ''}</Badge></div>}
    {value.productId && <div className="flex items-end"><Button variant="ghost" size="sm" onClick={() => onChange({ ...value, productId: null, manualProductName: '', manualProductModel: '' })}>Use manual product</Button></div>}
  </div>;
}
