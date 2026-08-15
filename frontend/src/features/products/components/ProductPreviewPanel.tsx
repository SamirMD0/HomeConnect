import React from 'react';
import { AlertTriangle, Archive, ExternalLink, PackagePlus, RotateCcw, ScanLine, ShoppingCart } from 'lucide-react';
import { formatMoney } from '../../customer-financial/utils/financial-format';
import { useProductInventory } from '../../inventory/hooks/useInventory';
import { useProduct } from '../hooks/useProducts';
import { ProductImageView } from './ProductImageView';
import { ProductStockBadge } from './ProductStockBadge';

export interface ProductPreviewPanelProps {
  productId: string | null;
  /** The scanned code also matched a different product's SKU. */
  alsoMatchedSku?: boolean;
  onOpenProduct: (productId: string) => void;
  onMakeOrder: (productId: string) => void;
  /**
   * `canPrefill` is false when the product cannot legally be received yet, so
   * the caller opens the receiving form empty instead of seeding it with a
   * line the form would refuse to accept.
   */
  onReceiveStock: (productId: string, canPrefill: boolean) => void;
  onClear?: () => void;
}

/**
 * The product preview, as a panel rather than a dialog.
 *
 * It lives directly on the page so the counter can see what a scan resolved to
 * without a modal opening over the workspace, and so the area reads as a
 * product screen — with an empty state — before anything has been scanned.
 *
 * Read-only by construction: it fetches product and inventory detail and hands
 * every action back to the caller as navigation. It writes nothing.
 */
export const ProductPreviewPanel: React.FC<ProductPreviewPanelProps> = ({
  productId, alsoMatchedSku = false, onOpenProduct, onMakeOrder, onReceiveStock, onClear,
}) => {
  const product = useProduct(productId ?? '');
  const inventory = useProductInventory(productId ?? '');
  const item = product.data;
  const price = item?.pricing?.pricingAvailable ? item.pricing.cashPrice : item?.netPrice ?? item?.price ?? null;
  // Receiving demands a stock-tracked product with a verified opening count.
  // Prefilling anything else would hand the user a form they cannot submit.
  const canPrefillReceiving = Boolean(item?.trackStock) && inventory.data?.onboardingStatus === 'ONBOARDED';
  const specifications = Array.isArray(item?.specifications) ? item!.specifications.slice(0, 4) : [];

  return (
    <section className="rounded-lg border border-slate-200 bg-white">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-2.5">
        <h2 className="text-sm font-semibold text-slate-800">Product Preview / معاينة المنتج</h2>
        {productId && onClear && (
          <button type="button" onClick={onClear} className="text-xs font-semibold text-slate-500 hover:text-slate-700">
            Clear / مسح
          </button>
        )}
      </header>

      {!productId && (
        <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
          <ScanLine className="h-8 w-8 text-slate-300" />
          <p className="text-sm text-slate-500">Scan or search a product to preview it / امسح أو ابحث عن منتج لعرضه</p>
        </div>
      )}

      {productId && product.isLoading && (
        <p role="status" className="flex items-center gap-2 px-4 py-8 text-sm text-slate-600">
          <RotateCcw className="h-4 w-4 animate-spin" /> Loading product / جارٍ تحميل المنتج…
        </p>
      )}

      {productId && product.isError && (
        <div role="alert" className="m-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <p>Unable to load product details / تعذر تحميل تفاصيل المنتج</p>
          <button type="button" onClick={() => product.refetch()} className="mt-3 rounded-lg border border-red-300 bg-white px-3 py-1.5 font-semibold">
            Retry / إعادة المحاولة
          </button>
        </div>
      )}

      {item && <div className="space-y-4 p-4">
        {!item.isActive && (
          <div className="flex items-center gap-2 rounded-lg border border-slate-300 bg-slate-100 p-3 text-sm font-semibold text-slate-800">
            <Archive className="h-4 w-4" /> Archived product — ordering is unavailable / منتج مؤرشف — لا يمكن إنشاء طلب
          </div>
        )}
        {alsoMatchedSku && (
          <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <AlertTriangle className="h-4 w-4" /> This barcode is also another product&apos;s SKU / هذا الباركود هو أيضًا رمز منتج آخر
          </div>
        )}

        <div className="grid gap-5 sm:grid-cols-[12rem_1fr]">
          <ProductImageView
            productId={item.id}
            image={item.image}
            alt={item.name}
            fit="contain"
            className="h-48 w-full rounded-lg border border-slate-200 bg-slate-50 p-2"
          />
          <div className="min-w-0 space-y-4">
            <div>
              <h3 className="user-text text-xl font-bold text-slate-900" dir="auto">{item.name}</h3>
              <p className="user-text mt-1 text-sm text-slate-600" dir="auto">{item.model}{item.brand ? ` · ${item.brand}` : ''}</p>
            </div>
            <dl className="grid gap-3 sm:grid-cols-2">
              <PreviewValue label="SKU" value={item.sku} mono />
              <PreviewValue label="Barcode / الباركود" value={item.barcode ?? '—'} mono />
              <PreviewValue label="Price / السعر" value={price ? formatMoney(price) : '—'} />
              <div>
                <dt className="text-xs font-medium text-slate-500">Stock / المخزون</dt>
                <dd className="mt-1 flex flex-wrap items-center gap-2">
                  <ProductStockBadge status={item.stockStatus} />
                  {item.trackStock && <span className="text-sm font-semibold tabular-nums text-slate-800">{item.stockQuantity} in stock / في المخزون</span>}
                </dd>
              </div>
            </dl>
            {specifications.length > 0 && (
              <dl className="grid gap-2 border-t border-slate-100 pt-3 sm:grid-cols-2">
                {specifications.map((spec) => (
                  <div key={spec.label}>
                    <dt className="text-xs font-medium text-slate-500" dir="auto">{spec.label}</dt>
                    <dd className="user-text text-sm text-slate-800" dir="auto">{spec.value}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        </div>

        {inventory.isLoading && <p className="text-xs text-slate-500">Checking inventory status / جارٍ فحص حالة المخزون…</p>}
        {inventory.data?.onboardingStatus === 'PENDING_ONBOARDING' && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            Needs a verified opening count / يحتاج إلى جرد افتتاحي مؤكد
          </p>
        )}
        {inventory.isError && <p className="text-xs text-slate-500">Inventory status unavailable / حالة المخزون غير متاحة</p>}

        <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
          <button
            type="button"
            onClick={() => onMakeOrder(item.id)}
            disabled={!item.isActive}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            <ShoppingCart className="h-4 w-4" /> Make Order / إنشاء طلب
          </button>
          <button
            type="button"
            onClick={() => onReceiveStock(item.id, canPrefillReceiving)}
            className="inline-flex items-center gap-2 rounded-lg border border-emerald-600 bg-white px-4 py-2 text-sm font-semibold text-emerald-700"
          >
            <PackagePlus className="h-4 w-4" /> Receive Stock / إدخال مخزون
          </button>
          <button
            type="button"
            onClick={() => onOpenProduct(item.id)}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700"
          >
            <ExternalLink className="h-4 w-4" /> Open Product / فتح المنتج
          </button>
        </div>
        <p className="text-xs text-slate-500">
          Receiving records stock only — it creates no supplier debt / الإدخال يسجّل المخزون فقط ولا ينشئ دينًا للمورد
        </p>
      </div>}
    </section>
  );
};

const PreviewValue: React.FC<{ label: string; value: string; mono?: boolean }> = ({ label, value, mono }) => (
  <div>
    <dt className="text-xs font-medium text-slate-500">{label}</dt>
    <dd className={`user-text mt-1 text-sm font-semibold text-slate-900 ${mono ? 'font-mono' : ''}`} dir="auto">{value}</dd>
  </div>
);
