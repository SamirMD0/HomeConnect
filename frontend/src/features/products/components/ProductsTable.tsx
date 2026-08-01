import React, { useEffect, useRef } from 'react';
import { Archive, Edit3, Eye, Printer, RotateCcw, TriangleAlert } from 'lucide-react';
import { Link } from 'react-router-dom';
import { formatMoney } from '../../customer-financial/utils/financial-format';
import { Product } from '../types/product.types';
import { ProductImageView } from './ProductImageView';
import { ProductMobileCard } from './ProductMobileCard';
import { ProductStatusBadge } from './ProductStatusBadge';

interface ProductsTableProps {
  products: Product[];
  selectedIds: Set<string>;
  canAdmin: boolean;
  onSelect: (id: string, selected: boolean) => void;
  onSelectAll: (selected: boolean) => void;
  onView: (product: Product) => void;
  onEdit: (product: Product) => void;
  onArchive: (product: Product) => void;
  onRestore: (product: Product) => void;
}

export const ProductsTable: React.FC<ProductsTableProps> = ({
  products, selectedIds, canAdmin, onSelect, onSelectAll, onView, onEdit, onArchive, onRestore,
}) => (
  <>
    <div className="hidden overflow-x-auto rounded-lg border border-slate-200 bg-white lg:block">
      <table className="w-full min-w-250 text-left text-sm text-slate-700">
        <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
          <tr>
            <th scope="col" className="w-11 px-3 py-2.5">
              <SelectAllCheckbox products={products} selectedIds={selectedIds} onSelectAll={onSelectAll} />
            </th>
            <th scope="col" className="w-full max-w-0 px-4 py-2.5"><ColumnHeading english="Product" arabic="المنتج" /></th>
            <th scope="col" className="whitespace-nowrap px-4 py-2.5"><ColumnHeading english="Pricing Formula" arabic="صيغة التسعير" /></th>
            {canAdmin && <th scope="col" className="whitespace-nowrap px-4 py-2.5"><ColumnHeading english="Cost" arabic="التكلفة" align="right" /></th>}
            <th scope="col" className="whitespace-nowrap px-4 py-2.5"><ColumnHeading english="Cash Price" arabic="السعر النقدي" align="right" /></th>
            <th scope="col" className="whitespace-nowrap px-4 py-2.5"><ColumnHeading english="Installment" arabic="التقسيط" align="right" /></th>
            <th scope="col" className="whitespace-nowrap px-4 py-2.5"><ColumnHeading english="Status" arabic="الحالة" /></th>
            <th scope="col" className="sticky right-0 whitespace-nowrap bg-slate-50 px-4 py-2.5"><ColumnHeading english="Actions" arabic="الإجراءات" align="right" /></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {products.map((product) => {
            const selected = selectedIds.has(product.id);
            const rowBg = selected
              ? 'bg-emerald-50/70 group-hover:bg-emerald-50'
              : product.isActive ? 'bg-white group-hover:bg-slate-50' : 'bg-slate-50/70 group-hover:bg-slate-100';

            return (
              <tr key={product.id} className={`group ${rowBg} ${product.isActive ? '' : 'text-slate-500'}`}>
                <td className="px-3 py-3 align-top">
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={(event) => onSelect(product.id, event.target.checked)}
                    aria-label={`Select ${product.name}`}
                    className="mt-1 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                  />
                </td>

                <td className="w-full max-w-0 px-4 py-3 align-top">
                  <div className="flex min-w-0 items-start gap-3">
                    <ProductImageView
                      productId={product.id}
                      image={product.image}
                      alt=""
                      className="h-10 w-10 shrink-0 rounded-md border border-slate-200"
                    />
                    <div className="min-w-0 flex-1">
                      <button
                        type="button"
                        onClick={() => onView(product)}
                        className="user-text block max-w-full truncate text-left font-semibold text-slate-900 hover:text-emerald-700 hover:underline"
                        dir="auto"
                      >
                        {product.name}
                      </button>
                      <span className="user-text mt-0.5 block truncate text-xs text-slate-500" dir="auto">
                        {product.model}{product.brand ? ` · ${product.brand}` : ''}
                      </span>
                      {product.barcode && (
                        <span className="mt-0.5 block truncate font-mono text-[11px] text-slate-400">{product.barcode}</span>
                      )}
                    </div>
                  </div>
                </td>

                <td className="whitespace-nowrap px-4 py-3 align-top">
                  <PricingFormulaCell product={product} />
                </td>

                {canAdmin && (
                  <td className="whitespace-nowrap px-4 py-3 text-right align-top">
                    <Money value={product.pricing?.costPrice ?? undefined} className="text-slate-600" />
                  </td>
                )}

                <td className="whitespace-nowrap px-4 py-3 text-right align-top">
                  <CashPriceCell product={product} />
                </td>

                <td className="whitespace-nowrap px-4 py-3 text-right align-top">
                  <InstallmentCell product={product} />
                </td>

                <td className="whitespace-nowrap px-4 py-3 align-top"><ProductStatusBadge isActive={product.isActive} /></td>

                <td className={`sticky right-0 whitespace-nowrap px-4 py-3 align-top ${rowBg}`}>
                  <div className="flex items-center justify-end gap-1.5">
                    <IconButton label="View details / عرض التفاصيل" onClick={() => onView(product)} primary><Eye className="h-4 w-4" /></IconButton>
                    <IconButton label="Edit product / تعديل المنتج" onClick={() => onEdit(product)}><Edit3 className="h-4 w-4" /></IconButton>
                    <Link
                      to={`/products/${product.id}/label`}
                      title="Print label / طباعة الملصق"
                      aria-label="Print label / طباعة الملصق"
                      className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-900"
                    >
                      <Printer className="h-4 w-4" />
                    </Link>
                    {canAdmin && (product.isActive
                      ? <IconButton label="Archive product / أرشفة المنتج" onClick={() => onArchive(product)}><Archive className="h-4 w-4" /></IconButton>
                      : <IconButton label="Restore product / استعادة المنتج" onClick={() => onRestore(product)}><RotateCcw className="h-4 w-4" /></IconButton>)}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>

    <div className="space-y-3 lg:hidden">
      {products.map((product) => (
        <ProductMobileCard
          key={product.id}
          product={product}
          selected={selectedIds.has(product.id)}
          canAdmin={canAdmin}
          onSelect={(value) => onSelect(product.id, value)}
          onView={() => onView(product)}
          onEdit={() => onEdit(product)}
          onArchive={() => onArchive(product)}
          onRestore={() => onRestore(product)}
        />
      ))}
    </div>
  </>
);

const SelectAllCheckbox: React.FC<{
  products: Product[];
  selectedIds: Set<string>;
  onSelectAll: (selected: boolean) => void;
}> = ({ products, selectedIds, onSelectAll }) => {
  const ref = useRef<HTMLInputElement>(null);
  const selectedCount = products.filter((product) => selectedIds.has(product.id)).length;
  const allSelected = products.length > 0 && selectedCount === products.length;

  useEffect(() => {
    if (ref.current) ref.current.indeterminate = selectedCount > 0 && !allSelected;
  }, [selectedCount, allSelected]);

  return (
    <input
      ref={ref}
      type="checkbox"
      checked={allSelected}
      onChange={(event) => onSelectAll(event.target.checked)}
      aria-label="Select all products on this page"
      className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
    />
  );
};

const PricingFormulaCell: React.FC<{ product: Product }> = ({ product }) => {
  const pricing = product.pricing;
  const archivedPreset = pricing?.pricingAvailable && pricing.warnings.includes('PRESET_ARCHIVED');

  if (pricing?.useCustomPricing) {
    return <Chip tone="blue">Custom / مخصص</Chip>;
  }
  if (pricing?.presetName) {
    return (
      <div className="flex min-w-0 items-center gap-1.5">
        <Chip>{pricing.presetName}</Chip>
        {archivedPreset && (
          <TriangleAlert
            className="h-3.5 w-3.5 shrink-0 text-amber-500"
            aria-label="Archived preset / صيغة مؤرشفة"
          />
        )}
      </div>
    );
  }
  return <span className="text-xs text-slate-400">No formula / دون صيغة</span>;
};

const CashPriceCell: React.FC<{ product: Product }> = ({ product }) => {
  const pricing = product.pricing;

  if (pricing?.pricingAvailable) {
    const manualDiffers = product.price != null && product.price !== pricing.cashPrice;
    return (
      <>
        <Money value={pricing.cashPrice} className="text-[15px] font-bold text-emerald-700" />
        {manualDiffers && (
          <span className="mt-0.5 block text-[11px] text-amber-600" title="Manual price differs from calculated price / السعر اليدوي يختلف عن المحسوب">
            manual <span dir="ltr" className="tabular-nums">{formatMoney(product.price as string)}</span>
          </span>
        )}
      </>
    );
  }

  if (product.price) {
    return (
      <>
        <Money value={product.price} className="font-semibold text-slate-700" />
        <span className="mt-0.5 block text-[11px] text-slate-400">manual / يدوي</span>
      </>
    );
  }

  return <Empty title="No pricing configured / لا يوجد تسعير" />;
};

const InstallmentCell: React.FC<{ product: Product }> = ({ product }) => {
  const pricing = product.pricing;
  if (!pricing?.pricingAvailable || !pricing.installmentPrice) {
    return <Empty title="No installment preview / لا توجد معاينة تقسيط" />;
  }

  return (
    <>
      <Money value={pricing.installmentPrice} className="font-semibold text-slate-900" />
      {pricing.downPayment && pricing.monthlyPayment && (
        <span
          dir="ltr"
          className="mt-0.5 block text-[11px] tabular-nums text-slate-500"
          title="Down payment + monthly installments / الدفعة الأولى + الأقساط الشهرية"
        >
          {formatMoney(pricing.downPayment)}
          {pricing.installmentMonths ? ` + ${pricing.installmentMonths} × ${formatMoney(pricing.monthlyPayment)}` : ''}
        </span>
      )}
    </>
  );
};

const Money: React.FC<{ value?: string; className?: string }> = ({ value, className = '' }) => (
  value
    ? <span dir="ltr" className={`block tabular-nums ${className}`}>{formatMoney(value)}</span>
    : <Empty />
);

const Empty: React.FC<{ title?: string }> = ({ title }) => (
  <span className="block text-slate-300" title={title}>—</span>
);

const Chip: React.FC<{ children: React.ReactNode; tone?: 'slate' | 'blue' }> = ({ children, tone = 'slate' }) => (
  <span
    dir="auto"
    className={`inline-block max-w-44 truncate align-middle rounded px-2 py-0.5 text-[11px] font-medium ${
      tone === 'blue' ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-600'
    }`}
  >
    {children}
  </span>
);

const IconButton: React.FC<{ label: string; onClick: () => void; children: React.ReactNode; primary?: boolean }> = ({ label, onClick, children, primary }) => (
  <button
    type="button"
    title={label}
    aria-label={label}
    onClick={onClick}
    className={`inline-flex h-9 w-9 items-center justify-center rounded-md border ${
      primary
        ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
        : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-900'
    }`}
  >
    {children}
  </button>
);

const ColumnHeading: React.FC<{ english: string; arabic: string; align?: 'left' | 'right' }> = ({ english, arabic, align = 'left' }) => (
  <span className={`block ${align === 'right' ? 'text-right' : 'text-left'}`}>
    <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-600">{english}</span>
    <span lang="ar" dir="rtl" className={`mt-0.5 block text-[11px] font-medium text-slate-400 ${align === 'right' ? 'text-right' : 'text-left'}`}>{arabic}</span>
  </span>
);
