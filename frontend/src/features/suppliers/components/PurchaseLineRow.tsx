import React from 'react';
import { Trash2 } from 'lucide-react';
import { Button } from '../../../components/ui';
import { sanitizeMoneyInput } from '../../customer-financial/utils/money-input';
import { ProductPicker } from '../../products/components/ProductPicker';
import type { Product } from '../../products/types/product.types';
import type { PurchaseLineMode } from '../types/supplier-purchase.types';
import { lineProblem, lineTotal, withMode, type PurchaseLineDraft } from '../utils/supplier-purchase-form';

interface Props {
  line: PurchaseLineDraft;
  index: number;
  /** Product ids already used by other lines, so the picker can grey them out. */
  takenProductIds: ReadonlySet<string>;
  /** Product lines will move stock, so a verified opening count is required. */
  requireOpeningCount: boolean;
  canRemove: boolean;
  onChange: (line: PurchaseLineDraft) => void;
  onRemove: () => void;
}

const MODES: Array<{ value: PurchaseLineMode; label: string }> = [
  { value: 'EXISTING_PRODUCT', label: 'Existing product / منتج موجود' },
  { value: 'NEW_PRODUCT', label: 'Quick add product / منتج جديد' },
  { value: 'MANUAL', label: 'Description only / وصف فقط' },
];

export const PurchaseLineRow: React.FC<Props> = ({ line, index, takenProductIds, requireOpeningCount, canRemove, onChange, onRemove }) => {
  const set = <K extends keyof PurchaseLineDraft>(key: K, value: PurchaseLineDraft[K]) => onChange({ ...line, [key]: value });
  const problem = lineProblem(line);
  const total = lineTotal(line);

  const selectProduct = (product: Product | null) => onChange({
    ...line,
    productId: product?.id ?? null,
    productName: product?.name ?? '',
    productLabel: product ? `${product.name} · ${product.sku}` : '',
    productStock: product?.trackStock ? product.stockQuantity : null,
    lastCost: product?.pricing?.costPrice ?? null,
    // Pre-fill the last recorded cost, but only into an untouched field — never
    // over a price the user has already typed.
    unitPrice: line.unitPrice || product?.pricing?.costPrice || '',
  });

  return <fieldset className="space-y-3 rounded-lg border border-slate-200 bg-white p-3">
    <legend className="px-2 text-sm font-semibold text-slate-700">Line {index + 1} / بند {index + 1}</legend>

    <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
      {MODES.map((mode) => <label key={mode.value} className="flex items-center gap-2">
        <input
          type="radio"
          name={`line-mode-${line.key}`}
          checked={line.mode === mode.value}
          onChange={() => onChange(withMode(line, mode.value))}
        />
        {mode.label}
      </label>)}
    </div>

    {line.mode === 'EXISTING_PRODUCT' && <div className="space-y-2">
      {line.productId
        ? <div className="flex items-center justify-between gap-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2">
            <span>
              <span className="user-text block text-sm font-semibold" dir="auto">{line.productLabel}</span>
              {line.productStock !== null && <span className="text-xs text-slate-600">In stock: {line.productStock} / المتوفر: {line.productStock}</span>}
            </span>
            <Button type="button" variant="ghost" size="sm" onClick={() => onChange(withMode(line, 'EXISTING_PRODUCT'))}>Change / تغيير</Button>
          </div>
        : <ProductPicker
            selectedProductId={line.productId}
            onSelect={selectProduct}
            requireOpeningCount={requireOpeningCount}
            disabledProductIds={takenProductIds}
          />}
    </div>}

    {line.mode === 'NEW_PRODUCT' && <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Product name / اسم المنتج *" value={line.newName} onChange={(value) => set('newName', value)} />
      <Field label="Model / الموديل *" value={line.newModel} onChange={(value) => set('newModel', value)} />
      <Field label="Barcode / الباركود" value={line.newBarcode} onChange={(value) => set('newBarcode', value)} />
      <Field label="Brand / العلامة التجارية" value={line.newBrand} onChange={(value) => set('newBrand', value)} />
      <Field label="Selling price / سعر البيع" inputMode="decimal" value={line.newSellingPrice} onChange={(value) => set('newSellingPrice', sanitizeMoneyInput(value))} />
    </div>}

    {line.mode === 'MANUAL'
      ? <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Description / الوصف *" value={line.description} onChange={(value) => set('description', value)} />
          <Field label="Amount / المبلغ *" inputMode="decimal" value={line.amount} onChange={(value) => set('amount', sanitizeMoneyInput(value))} />
        </div>
      : <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Quantity / الكمية *" inputMode="numeric" value={line.quantity} onChange={(value) => set('quantity', value.replace(/\D/g, ''))} />
          <Field label="Unit price / سعر الوحدة *" inputMode="decimal" value={line.unitPrice} onChange={(value) => set('unitPrice', sanitizeMoneyInput(value))}
            hint={line.lastCost ? `Last recorded cost ${line.lastCost} / آخر كلفة مسجلة` : undefined} />
          <div className="flex flex-col justify-end pb-2">
            <span className="text-xs text-slate-500">Line total / إجمالي البند</span>
            <strong className="tabular-nums text-slate-900">{total ?? '—'}</strong>
          </div>
        </div>}

    <div className="flex items-center justify-between gap-3">
      {problem
        ? <p role="status" className="text-xs font-semibold text-amber-700">{problem}</p>
        : <span />}
      {canRemove && <Button type="button" variant="ghost" size="sm" icon={<Trash2 />} onClick={onRemove}>Remove line / حذف البند</Button>}
    </div>
  </fieldset>;
};

const Field: React.FC<{
  label: string; value: string; onChange: (value: string) => void; inputMode?: 'decimal' | 'numeric'; hint?: string;
}> = ({ label, value, onChange, inputMode, hint }) => <label className="block text-sm font-semibold text-slate-700">
  {label}
  <input
    dir="auto"
    inputMode={inputMode}
    value={value}
    onChange={(event) => onChange(event.target.value)}
    className="user-text-input mt-1 w-full rounded-md border border-slate-300 px-3 py-2 font-normal"
  />
  {hint && <span className="mt-1 block text-xs font-normal text-slate-500">{hint}</span>}
</label>;
