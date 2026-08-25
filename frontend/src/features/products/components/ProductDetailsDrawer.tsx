import React, { useEffect, useRef, useState } from 'react';
import { Archive, Copy, Edit3, Printer, RotateCcw, ShoppingCart, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { formatBusinessDate, formatDateTime, formatMoney } from '../../customer-financial/utils/financial-format';
import { useAuth } from '../../../hooks/useAuth';
import { useDialogFocus } from '../../../hooks/useDialogFocus';
import { salesOrderCreateUrl } from '../../sales-orders/utils/sales-order-links';
import { businessLabels } from '../../../shared/labels/business-labels';
import { useProduct, useProductAudit, useProductPricing, useProductServiceJobs } from '../hooks/useProducts';
import { Product } from '../types/product.types';
import { productLabels } from '../utils/product-labels';
import { ProductImagePlaceholder, ProductImageView } from './ProductImageView';
import { ProductStatusBadge } from './ProductStatusBadge';
import { ProductStockBadge } from './ProductStockBadge';
import { ProductPricingSection } from './ProductPricingSection';
import { PricingPreviewCard } from '../../pricing/components/PricingPreviewCard';
import { ProductSpecificationsView } from './ProductSpecificationsView';
import { ProductSkuEditDialog } from './ProductSkuEditDialog';
import { ProductLabelPanel } from './ProductLabelPanel';
import { ProductInventoryPanel } from '../../inventory/components/ProductInventoryPanel';

interface ProductDetailsDrawerProps {
  productId: string | null;
  initialSection?: ProductDetailSection;
  onClose: () => void;
  onEdit: (product: Product) => void;
  onArchive: (product: Product) => void;
  onRestore: (product: Product) => void;
}

type ProductDetailSection = 'info' | 'stock' | 'specs' | 'label' | 'pricing' | 'notes' | 'record' | 'jobs' | 'audit';

export const ProductDetailsDrawer: React.FC<ProductDetailsDrawerProps> = ({ productId, initialSection, onClose, onEdit, onArchive, onRestore }) => {
  const { user } = useAuth();
  const product = useProduct(productId ?? '');
  const audit = useProductAudit(productId ?? '', user?.role === 'ADMIN');
  const jobs = useProductServiceJobs(productId ?? '');
  const pricing = useProductPricing(productId ?? '');
  const [skuProduct, setSkuProduct] = useState<Product | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const item = product.data;

  // Focus stays inside the sheet and returns to the row that opened it; the
  // SKU dialog runs its own trap, so this one stands down while it is open.
  useDialogFocus(panelRef, Boolean(productId) && !skuProduct);

  useEffect(() => {
    if (!productId) return;
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [productId, onClose]);

  useEffect(() => {
    if (!productId || !item || !initialSection) return;
    const frame = window.requestAnimationFrame(() => scrollToProductSection(initialSection));
    return () => window.cancelAnimationFrame(frame);
  }, [initialSection, item, productId]);

  if (!productId) return null;

  return <div className="fixed inset-0 z-40">
    <div ref={overlayRef} onClick={(event) => { if (event.target === overlayRef.current) onClose(); }} className="absolute inset-0 bg-slate-900/40" />
    <aside ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Product details" className="absolute inset-y-0 right-0 flex w-full max-w-xl flex-col bg-white shadow-2xl focus:outline-none lg:max-w-2xl xl:max-w-3xl">
      <header className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase text-brand-700">Product Details / تفاصيل المنتج</p>
          <h2 className="user-text mt-1 text-xl font-bold text-slate-900" dir="auto">{item?.name ?? 'Loading…'}</h2>
          {item && <p className="user-text text-sm text-slate-500" dir="auto">{item.model || 'No model / لا يوجد موديل'}{item.brand ? ` · ${item.brand}` : ' · No brand / لا توجد ماركة'}</p>}
          {item && <div className="mt-2 flex flex-wrap items-center gap-2"><ProductStatusBadge isActive={item.isActive} /><ProductStockBadge status={item.stockStatus} /><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold tabular-nums text-slate-700">{item.stockQuantity} units / وحدة</span></div>}
        </div>
        <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Close"><X className="h-5 w-5" /></button>
      </header>

      <div className="flex-1 overflow-y-auto px-5 py-5">
        {item && <nav aria-label="Product sections / أقسام المنتج" className="sticky top-0 z-20 -mx-5 -mt-5 mb-5 flex gap-2 overflow-x-auto border-b border-slate-200 bg-white/95 px-5 py-3 shadow-sm backdrop-blur">{sectionLinks.filter((link) => link.id !== 'audit' || user?.role === 'ADMIN').map((link) => <a key={link.id} href={`#product-${link.id}`} onClick={(event) => { event.preventDefault(); scrollToProductSection(link.id); }} className="shrink-0 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700">{link.label}</a>)}</nav>}
        {product.isLoading && <p className="text-sm text-slate-500">Loading product…</p>}
        {product.isError && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">Unable to load product details.</p>}
        {item && <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => onEdit(item)} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium"><Edit3 className="h-4 w-4" /> {businessLabels.common.edit}</button>
            {/* The catalogue rows offer this; the drawer is the deeper surface and must not offer less. */}
            <Link to={salesOrderCreateUrl(item.id)} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium"><ShoppingCart className="h-4 w-4" /> Make Order / إنشاء طلب</Link>
            <Link to={`/products/${item.id}/label`} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium"><Printer className="h-4 w-4" /> {businessLabels.product.printLabel}</Link>
            {user?.role === 'ADMIN' && (item.isActive
              ? <button type="button" onClick={() => onArchive(item)} className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-700"><Archive className="h-4 w-4" /> Archive / أرشفة</button>
              : <button type="button" onClick={() => onRestore(item)} className="inline-flex items-center gap-2 rounded-lg border border-brand-200 px-3 py-2 text-sm font-medium text-brand-700"><RotateCcw className="h-4 w-4" /> Restore / استعادة</button>)}
          </div>

          <ProductImageView
            productId={item.id}
            image={item.image}
            alt={item.name}
            fit="contain"
            className="h-96 max-h-[55vh] w-full rounded-lg border border-slate-200 bg-slate-50 p-2"
            placeholder={<ProductImagePlaceholder className="h-64 w-full rounded-lg border border-dashed border-slate-300" />}
          />

          <Section id="info" title="Product Information / معلومات المنتج"><dl className="grid gap-4 sm:grid-cols-2">
            <Value label={businessLabels.product.name} value={item.name} auto />
            <div><dt className="text-xs font-medium text-slate-500">SKU</dt><dd className="mt-1 flex items-center gap-2 font-mono text-sm font-bold"><span>{item.sku}</span><button type="button" title="Copy SKU" onClick={() => navigator.clipboard.writeText(item.sku)} className="text-slate-500"><Copy className="h-4 w-4" /></button>{user?.role === 'ADMIN' && <button type="button" onClick={() => setSkuProduct(item)} className="font-sans text-xs font-semibold text-brand-700">Edit</button>}</dd></div>
            <Value label={businessLabels.product.model} value={item.model || 'No model / لا يوجد موديل'} auto empty={!item.model} />
            <Value label={businessLabels.product.brand} value={item.brand || 'No brand / لا توجد ماركة'} auto empty={!item.brand} />
            <Value label={businessLabels.product.barcode} value={item.barcode || 'No barcode / لا يوجد باركود'} empty={!item.barcode} />
            {/* Both stock settings, read-only. Quantity is an inventory movement, never a form field. */}
            <Value label="Stock tracking / تتبع المخزون" value={item.trackStock ? 'Tracked / متتبع' : 'Not tracked / غير متتبع'} />
            <Value label="Low-stock threshold / حد المخزون المنخفض" value={item.trackStock && item.lowStockThreshold != null ? String(item.lowStockThreshold) : '—'} />
            <Value label={businessLabels.product.price} value={item.price ? formatMoney(item.price) : '—'} />
            <Value label={businessLabels.product.discountAmount} value={item.discount ? formatMoney(item.discount) : '—'} />
            <Value label={businessLabels.product.netPrice} value={item.netPrice ? formatMoney(item.netPrice) : '—'} />
          </dl></Section>

          <Section id="stock" title="Stock / المخزون"><ProductInventoryPanel productId={item.id} /></Section>

          <Section id="specs" title="Specifications / المواصفات"><ProductSpecificationsView specifications={item.specifications} notes={item.specificationNotes} /></Section>

          <Section id="label" title="Label / الملصق"><ProductLabelPanel product={item} /></Section>

          <Section id="pricing" title="Pricing / التسعير"><div className="space-y-4"><PricingPreviewCard preview={pricing.data} loading={pricing.isLoading} showInstallment={item.pricing?.installmentEnabled ?? false} />{user?.role === 'ADMIN' && <ProductPricingSection product={item} />}</div></Section>

          <Section id="notes" title={businessLabels.product.notes}><p className="user-text-pre whitespace-pre-wrap text-sm text-slate-700" dir="auto">{item.notes || 'No notes / لا توجد ملاحظات'}</p></Section>

          <Section id="record" title="Record Information / معلومات السجل"><dl className="grid gap-4 sm:grid-cols-2">
            <Value label={productLabels.createdBy} value={actor(item.createdBy)} />
            <Value label="Created / تاريخ الإنشاء" value={formatDateTime(item.createdAt)} />
            <Value label={productLabels.updatedBy} value={actor(item.updatedBy)} />
            <Value label="Updated / تاريخ التعديل" value={formatDateTime(item.updatedAt)} />
          </dl></Section>

          <Section id="jobs" title={productLabels.relatedJobs}>
            {jobs.isLoading ? <p className="text-sm text-slate-500">Loading related jobs…</p> : jobs.data?.items.length ? <div className="divide-y divide-slate-100">{jobs.data.items.map((job) => <Link key={job.id} to={`/service/${job.id}`} className="flex items-center justify-between gap-3 py-3 hover:text-brand-700"><span><span className="block font-semibold">{job.jobNumber}</span><span className="block text-xs text-slate-500">{formatBusinessDate(job.serviceCreatedDate)} · {job.customer.name}</span></span><span className="text-xs font-medium">{job.status.replaceAll('_', ' ')}</span></Link>)}</div> : <p className="text-sm text-slate-500">No related service jobs / لا توجد طلبات صيانة مرتبطة</p>}
          </Section>

          {user?.role === 'ADMIN' && <Section id="audit" title={productLabels.auditHistory}>
            {audit.isLoading ? <p className="text-sm text-slate-500">Loading audit history…</p> : audit.data?.length ? <div className="space-y-4">{audit.data.map((entry) => <div key={entry.id} className="border-l-2 border-slate-200 pl-3 text-sm"><div className="flex flex-wrap justify-between gap-2"><strong>{entry.action.replaceAll('_', ' ')}</strong><span className="text-xs text-slate-500">{formatDateTime(entry.changedAt)}</span></div><p className="mt-1 text-slate-600"><span className="font-medium">Reason / السبب:</span> {entry.reason}</p><p className="mt-1 text-xs text-slate-500">{entry.changedByName} ({entry.changedByUsername})</p><div className="mt-2 space-y-1">{auditChanges(entry.beforeValues, entry.afterValues).map((change) => <p key={change} className="break-words rounded bg-slate-50 px-2 py-1 text-xs">{change}</p>)}</div></div>)}</div> : <p className="text-sm text-slate-500">No audit entries.</p>}
          </Section>}
        </div>}
      </div>
    </aside>
    <ProductSkuEditDialog product={skuProduct} onClose={() => setSkuProduct(null)} />
  </div>;
};

const sectionLinks: Array<{ id: ProductDetailSection; label: string }> = [
  { id: 'info', label: 'Info / المعلومات' }, { id: 'stock', label: 'Stock / المخزون' },
  { id: 'specs', label: 'Specs / المواصفات' }, { id: 'label', label: 'Label / الملصق' },
  { id: 'pricing', label: 'Pricing / التسعير' }, { id: 'notes', label: 'Notes / الملاحظات' },
  { id: 'record', label: 'Record / السجل' }, { id: 'jobs', label: 'Jobs / الصيانة' },
  { id: 'audit', label: 'Audit / التدقيق' },
];
const scrollToProductSection = (section: ProductDetailSection) => document.getElementById(`product-${section}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
const Section: React.FC<{ id: ProductDetailSection; title: string; children: React.ReactNode }> = ({ id, title, children }) => <section id={`product-${id}`} className="scroll-mt-16 border-t border-slate-200 pt-4"><h3 className="mb-3 text-sm font-semibold uppercase text-slate-700">{title}</h3>{children}</section>;
const Value: React.FC<{ label: string; value: string; auto?: boolean; empty?: boolean }> = ({ label, value, auto, empty }) => <div><dt className="text-xs font-medium text-slate-500">{label}</dt><dd className={`user-text mt-1 text-sm font-medium ${empty ? 'text-slate-400' : 'text-slate-900'}`} dir={auto ? 'auto' : undefined}>{value}</dd></div>;
const actor = (value?: { fullName: string; username: string } | null) => value ? `${value.fullName} (${value.username})` : '—';
const auditChanges = (before: Record<string, unknown>, after: Record<string, unknown>) => [...new Set([...Object.keys(before), ...Object.keys(after)])].map((key) => `${key}: ${display(before[key])} → ${display(after[key])}`);
const display = (value: unknown) => value == null ? '—' : typeof value === 'object' ? JSON.stringify(value) : String(value);
