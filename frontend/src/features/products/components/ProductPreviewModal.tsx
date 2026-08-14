import React from 'react';
import { AlertTriangle, Archive, ExternalLink, RotateCcw, ShoppingCart } from 'lucide-react';
import { Modal } from '../../../components/ui/Modal';
import { formatMoney } from '../../customer-financial/utils/financial-format';
import { useProductInventory } from '../../inventory/hooks/useInventory';
import { useProduct } from '../hooks/useProducts';
import { ProductImageView } from './ProductImageView';
import { ProductStockBadge } from './ProductStockBadge';

interface ProductPreviewModalProps {
  productId: string | null;
  alsoMatchedSku?: boolean;
  onClose: () => void;
  onOpenProduct: (productId: string) => void;
  onMakeOrder: (productId: string) => void;
}

export const ProductPreviewModal: React.FC<ProductPreviewModalProps> = ({
  productId,
  alsoMatchedSku = false,
  onClose,
  onOpenProduct,
  onMakeOrder,
}) => {
  const product = useProduct(productId ?? '');
  const inventory = useProductInventory(productId ?? '');
  const item = product.data;
  const price = item?.pricing?.pricingAvailable
    ? item.pricing.cashPrice
    : item?.netPrice ?? item?.price ?? null;

  return (
    <Modal
      isOpen={Boolean(productId)}
      onClose={onClose}
      title="Product Preview / معاينة المنتج"
      size="lg"
      footer={item ? <>
        <button
          type="button"
          onClick={() => onOpenProduct(item.id)}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700"
        >
          <ExternalLink className="h-4 w-4" /> Open product / فتح المنتج
        </button>
        <button
          type="button"
          onClick={() => onMakeOrder(item.id)}
          disabled={!item.isActive}
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ShoppingCart className="h-4 w-4" /> Make Order / إنشاء طلب
        </button>
      </> : undefined}
    >
      {product.isLoading && (
        <div role="status" className="flex items-center gap-2 py-8 text-sm text-slate-600">
          <RotateCcw className="h-4 w-4 animate-spin" /> Loading product / جارٍ تحميل المنتج…
        </div>
      )}

      {product.isError && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <p>Unable to load product details / تعذر تحميل تفاصيل المنتج</p>
          <button type="button" onClick={() => product.refetch()} className="mt-3 rounded-lg border border-red-300 bg-white px-3 py-1.5 font-semibold">
            Retry / إعادة المحاولة
          </button>
        </div>
      )}

      {item && <div className="space-y-4">
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
          </div>
        </div>

        {inventory.isLoading && <p className="text-xs text-slate-500">Checking inventory status / جارٍ فحص حالة المخزون…</p>}
        {inventory.data?.onboardingStatus === 'PENDING_ONBOARDING' && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            Needs a verified opening count / يحتاج إلى جرد افتتاحي مؤكد
          </p>
        )}
        {inventory.isError && (
          <p className="text-xs text-slate-500">Inventory status unavailable / حالة المخزون غير متاحة</p>
        )}
      </div>}
    </Modal>
  );
};

const PreviewValue: React.FC<{ label: string; value: string; mono?: boolean }> = ({ label, value, mono }) => (
  <div>
    <dt className="text-xs font-medium text-slate-500">{label}</dt>
    <dd className={`user-text mt-1 text-sm font-semibold text-slate-900 ${mono ? 'font-mono' : ''}`} dir="auto">{value}</dd>
  </div>
);
