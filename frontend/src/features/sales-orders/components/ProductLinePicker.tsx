import { AlertTriangle, PackageSearch } from 'lucide-react';
import { Badge, Button, FormField, Input, Select } from '../../../components/ui';
import { useProducts } from '../../products/hooks/useProducts';
import type { SalesOrderLineInput } from '../types/sales-orders.types';

export function ProductLinePicker({ value, onChange }: { value: SalesOrderLineInput; onChange: (value: SalesOrderLineInput) => void }) {
  const products = useProducts({ isActive: true, pageSize: 100, sortBy: 'name', sortOrder: 'asc' });
  const selectProduct = (id: string) => {
    const product = products.data?.items.find((candidate) => candidate.id === id);
    if (!product) { onChange({ ...value, productId: null }); return; }
    const suggested = product.pricing?.pricingAvailable ? product.pricing.cashPrice : product.netPrice ?? product.price ?? '0.00';
    onChange({ ...value, productId: product.id, manualProductName: null, manualProductModel: null, unitPrice: suggested });
  };
  const product = products.data?.items.find((candidate) => candidate.id === value.productId);
  return <div className="grid gap-3 sm:grid-cols-2">
    <FormField label="Catalog product / منتج من الكتالوج" hint="Search by name, SKU or barcode in the product list.">{(field) => <Select {...field} value={value.productId ?? ''} onChange={(event) => selectProduct(event.target.value)}><option value="">Manual product</option>{products.data?.items.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.model} · {item.sku}</option>)}</Select>}</FormField>
    {!value.productId && <FormField label="Manual product name / اسم المنتج" required>{(field) => <Input {...field} userText value={value.manualProductName ?? ''} onChange={(event) => onChange({ ...value, manualProductName: event.target.value })} />}</FormField>}
    {!value.productId && <FormField label="Manual model / الموديل">{(field) => <Input {...field} userText value={value.manualProductModel ?? ''} onChange={(event) => onChange({ ...value, manualProductModel: event.target.value })} />}</FormField>}
    <FormField label="Quantity / الكمية" required>{(field) => <Input {...field} numeric type="number" min={1} max={999} value={value.quantity} onChange={(event) => onChange({ ...value, quantity: Math.max(1, Number.parseInt(event.target.value || '1', 10)) })} />}</FormField>
    <FormField label="Unit price / سعر الوحدة" required>{(field) => <Input {...field} numeric inputMode="decimal" value={value.unitPrice} onChange={(event) => onChange({ ...value, unitPrice: event.target.value })} />}</FormField>
    {product?.trackStock && <div className="flex items-end"><Badge tone={product.stockQuantity <= 0 ? 'warning' : 'info'} icon={product.stockQuantity < value.quantity ? <AlertTriangle /> : <PackageSearch />}>In stock: {product.stockQuantity}{product.stockQuantity < value.quantity ? ' · selling above stock is allowed' : ''}</Badge></div>}
    {value.productId && <div className="flex items-end"><Button variant="ghost" size="sm" onClick={() => onChange({ ...value, productId: null, manualProductName: '', manualProductModel: '' })}>Use manual product</Button></div>}
  </div>;
}
