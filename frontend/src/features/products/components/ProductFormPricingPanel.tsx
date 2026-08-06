import React, { useEffect, useMemo } from 'react';
import { PricingPreviewCard } from '../../pricing/components/PricingPreviewCard';
import { usePricingPresets } from '../../pricing/hooks/usePricingPresets';
import { usePricingCalculation } from '../../pricing/hooks/usePricingPreview';
import { ProductPricingConfigurationFormValues } from '../../pricing/schemas/pricing.schemas';
import { PricingCalculateInput, PricingPreset } from '../../pricing/types/pricing.types';
import { ProductPricingMode } from '../types/product.types';

export interface ProductFormPricingValues extends ProductPricingConfigurationFormValues {
  mode: ProductPricingMode;
  previewInstallmentMonths: string;
  previewDownPaymentPercent: string;
  previewInstallmentMarkupPercent: string;
}

export const emptyProductFormPricing: ProductFormPricingValues = {
  mode: 'NONE',
  costPrice: '',
  pricingPresetId: '',
  useCustomPricing: false,
  installmentEnabled: false,
  customExpensePercent: '',
  customProfitPercent: '',
  customDiscountBufferPercent: '',
  customInstallmentMarkupPercent: '',
  customDownPaymentPercent: '',
  customInstallmentMonths: '',
  customCalculationMode: 'COMPOUND',
  previewInstallmentMonths: '',
  previewDownPaymentPercent: '',
  previewInstallmentMarkupPercent: '',
};

interface ProductFormPricingPanelProps {
  value: ProductFormPricingValues;
  onChange: (value: ProductFormPricingValues) => void;
  manualPrice: string;
  manualDiscount: string;
  onManualPriceChange: (value: string) => void;
  onManualDiscountChange: (value: string) => void;
  errors?: Record<string, string>;
}

export const ProductFormPricingPanel: React.FC<ProductFormPricingPanelProps> = ({
  value, onChange, manualPrice, manualDiscount, onManualPriceChange, onManualDiscountChange, errors = {},
}) => {
  const presets = usePricingPresets({ isActive: true, pageSize: 100 });
  const activePresets = useMemo(() => presets.data?.items ?? [], [presets.data?.items]);
  const effectivePreset = activePresets.find((preset) => preset.id === value.pricingPresetId)
    ?? (!value.pricingPresetId ? activePresets.find((preset) => preset.isDefault) : undefined);

  useEffect(() => {
    if ((value.mode !== 'PRESET' && value.mode !== 'CUSTOM') || !effectivePreset) return;
    const presetValues = value.mode === 'CUSTOM'
      ? customValuesFromPreset(effectivePreset, value.installmentEnabled)
      : previewValuesFromPreset(effectivePreset, value.installmentEnabled);
    const next = { ...value };
    let changed = false;
    for (const field of Object.keys(presetValues) as Array<keyof ProductFormPricingValues>) {
      if (next[field] === '') {
        Object.assign(next, { [field]: presetValues[field] });
        changed = true;
      }
    }
    if (changed) onChange(next);
  }, [effectivePreset, onChange, value]);

  const previewMonths = value.installmentEnabled ? value.previewInstallmentMonths : '1';
  const previewDownPayment = value.installmentEnabled ? value.previewDownPaymentPercent : '100';
  const previewMarkup = value.installmentEnabled ? value.previewInstallmentMarkupPercent : '0';

  const set = <K extends keyof ProductFormPricingValues>(field: K, next: ProductFormPricingValues[K]) => {
    onChange({ ...value, [field]: next });
  };
  const selectPreset = (presetId: string) => {
    const nextPreset = activePresets.find((preset) => preset.id === presetId)
      ?? (!presetId ? activePresets.find((preset) => preset.isDefault) : undefined);
    onChange({
      ...value,
      pricingPresetId: presetId,
      previewInstallmentMonths: '',
      previewDownPaymentPercent: '',
      previewInstallmentMarkupPercent: '',
      ...(value.mode === 'CUSTOM' && nextPreset ? customValuesFromPreset(nextPreset, value.installmentEnabled) : {}),
    });
  };
  const selectMode = (mode: Exclude<ProductPricingMode, 'NONE'>) => {
    if (mode === 'MANUAL') {
      onChange({ ...emptyProductFormPricing, mode: 'MANUAL' });
      return;
    }
    if (mode === 'PRESET') {
      onChange({
        ...value,
        mode,
        useCustomPricing: false,
        customExpensePercent: '', customProfitPercent: '', customDiscountBufferPercent: '',
        customInstallmentMarkupPercent: '', customDownPaymentPercent: '', customInstallmentMonths: '',
        customCalculationMode: 'COMPOUND',
      });
      return;
    }
    onChange({ ...value, mode, useCustomPricing: true, ...(effectivePreset ? customValuesFromPreset(effectivePreset, value.installmentEnabled) : {}) });
  };
  const toggleInstallment = (enabled: boolean) => onChange({
    ...value,
    installmentEnabled: enabled,
    ...(!enabled ? {
      previewInstallmentMonths: '', previewDownPaymentPercent: '', previewInstallmentMarkupPercent: '',
      customInstallmentMarkupPercent: '', customDownPaymentPercent: '', customInstallmentMonths: '',
    } : {}),
  });

  const calculationInput = useMemo(
    () => buildProductPricingCalculationInput(value, effectivePreset),
    [effectivePreset, value]
  );
  const preview = usePricingCalculation(calculationInput);

  return (
    <section className="space-y-4 rounded-lg border border-slate-200 bg-slate-50 p-4" aria-label="Product Pricing / تسعير المنتج">
      <div>
        <h3 className="font-semibold text-slate-900">Pricing / التسعير</h3>
        <p className="mt-1 text-xs text-slate-600">Preview prices before saving. No debt or installment plan is created / عاين الأسعار قبل الحفظ دون إنشاء دين أو خطة تقسيط.</p>
      </div>

      <div>
        <span className="text-sm font-semibold text-slate-800">Pricing mode / طريقة التسعير</span>
        <div className="mt-2 grid gap-2 sm:grid-cols-3" role="group" aria-label="Pricing mode / طريقة التسعير">
          <ModeButton active={value.mode === 'PRESET'} onClick={() => selectMode('PRESET')}>Preset formula / صيغة جاهزة</ModeButton>
          <ModeButton active={value.mode === 'CUSTOM'} onClick={() => selectMode('CUSTOM')}>Custom formula / صيغة مخصصة</ModeButton>
          <ModeButton active={value.mode === 'MANUAL'} onClick={() => selectMode('MANUAL')}>Manual price / سعر يدوي</ModeButton>
        </div>
        {value.mode === 'NONE' && <p className="mt-2 text-xs text-slate-500">No pricing configured / لم يتم إعداد تسعير</p>}
      </div>

      {value.mode === 'MANUAL' ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Manual Selling Price / سعر البيع اليدوي" value={manualPrice} set={onManualPriceChange} error={errors.price} />
          <Field label="Manual Discount Amount / قيمة الخصم اليدوي" value={manualDiscount} set={onManualDiscountChange} error={errors.discount} />
        </div>
      ) : (
        <div className="grid gap-4 rounded-lg border border-slate-200 bg-white p-3 sm:grid-cols-2">
          <Field label="Existing Manual Selling Price / سعر البيع اليدوي الحالي" value={manualPrice} set={() => undefined} readOnly />
          <Field label="Existing Manual Discount / الخصم اليدوي الحالي" value={manualDiscount} set={() => undefined} readOnly />
        </div>
      )}

      {(value.mode === 'PRESET' || value.mode === 'CUSTOM') && <>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Real Cost Price / السعر الحقيقي" value={value.costPrice} set={(next) => set('costPrice', next)} error={errors.costPrice} />
          <label className="block text-sm font-medium text-slate-700">
            Pricing Preset / صيغة التسعير
            <select value={value.pricingPresetId} onChange={(event) => selectPreset(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2">
              <option value="">Default Pricing Preset / صيغة التسعير الافتراضية</option>
              {activePresets.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}
            </select>
            {errors.pricingPresetId && <span className="mt-1 block text-xs text-red-600">{errors.pricingPresetId}</span>}
          </label>
        </div>

        <label className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-3">
          <input type="checkbox" checked={value.installmentEnabled} onChange={(event) => toggleInstallment(event.target.checked)} className="mt-0.5 h-4 w-4" />
          <span>
            <span className="block text-sm font-semibold text-slate-800">Offer installment payment / إتاحة الدفع بالتقسيط</span>
            <span className="mt-0.5 block text-xs text-slate-500">Enable only when this product should be sold with an installment option / فعّل هذا الخيار فقط للمنتجات المتاحة بالتقسيط.</span>
          </span>
        </label>

        {value.mode === 'CUSTOM' && <div className="grid gap-3 rounded-lg border border-slate-200 bg-white p-3 sm:grid-cols-2">
          <Field label="Expenses % / نسبة المصاريف" value={value.customExpensePercent} set={(next) => set('customExpensePercent', next)} error={errors.customExpensePercent} />
          <Field label="Profit % / نسبة الربح" value={value.customProfitPercent} set={(next) => set('customProfitPercent', next)} error={errors.customProfitPercent} />
          <Field label="Discount Buffer % / هامش الخصم" value={value.customDiscountBufferPercent} set={(next) => set('customDiscountBufferPercent', next)} error={errors.customDiscountBufferPercent} />
          <label className="block text-sm font-medium text-slate-700">
            Calculation Mode / طريقة الحساب
            <select value={value.customCalculationMode} onChange={(event) => set('customCalculationMode', event.target.value as 'COMPOUND' | 'SIMPLE')} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2">
              <option value="COMPOUND">Compound / تراكمي</option>
              <option value="SIMPLE">Simple / بسيط</option>
            </select>
          </label>
        </div>}

        {value.installmentEnabled ? <div>
          <h4 className="text-sm font-semibold text-slate-800">Pricing Preview Overrides / تعديلات معاينة السعر</h4>
          <p className="mt-1 text-xs text-slate-500">Displayed values are the values that will be saved for custom pricing / القيم المعروضة هي القيم التي سيتم حفظها للتسعير المخصص.</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <Field label="Preview Installment Months / عدد أشهر التقسيط للمعاينة" value={previewMonths} set={(next) => set('previewInstallmentMonths', next)} error={errors.previewInstallmentMonths || errors.customInstallmentMonths} />
            <Field label="Preview Down Payment % / الدفعة الأولى للمعاينة" value={previewDownPayment} set={(next) => set('previewDownPaymentPercent', next)} error={errors.previewDownPaymentPercent || errors.customDownPaymentPercent} />
            <Field label="Preview Installment Markup % / زيادة التقسيط للمعاينة" value={previewMarkup} set={(next) => set('previewInstallmentMarkupPercent', next)} error={errors.previewInstallmentMarkupPercent || errors.customInstallmentMarkupPercent} />
          </div>
        </div> : <p className="rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-600">Installments not offered / التقسيط غير متاح</p>}

        {presets.isError && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">Unable to load pricing presets / تعذر تحميل صيغ التسعير</p>}
        {preview.isError && value.costPrice && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">Check the pricing values and active preset / تحقق من قيم التسعير والصيغة النشطة</p>}
        <PricingPreviewCard
          preview={preview.data}
          loading={preview.isLoading}
          stale={preview.isFetching}
          costPrice={value.costPrice}
          percents={{
            expensePercent: value.customExpensePercent || effectivePreset?.expensePercent || '',
            profitPercent: value.customProfitPercent || effectivePreset?.profitPercent || '',
            discountBufferPercent: value.customDiscountBufferPercent || effectivePreset?.discountBufferPercent || '',
            downPaymentPercent: previewDownPayment,
          }}
          showInstallment={value.installmentEnabled}
        />
      </>}
    </section>
  );
};

export function buildProductPricingCalculationInput(
  value: ProductFormPricingValues,
  effectivePreset?: PricingPreset
): PricingCalculateInput | null {
  if (!value.costPrice || (value.mode !== 'PRESET' && value.mode !== 'CUSTOM')) return null;
  const previewMonths = value.previewInstallmentMonths || String(effectivePreset?.defaultInstallmentMonths ?? '');
  const previewDownPayment = value.previewDownPaymentPercent || effectivePreset?.downPaymentPercent || '';
  const previewMarkup = value.previewInstallmentMarkupPercent || effectivePreset?.installmentMarkupPercent || '';
  const commonOverrides = {
    ...(previewDownPayment ? { downPaymentPercent: previewDownPayment } : {}),
    ...(previewMarkup ? { installmentMarkupPercent: previewMarkup } : {}),
  };
  return {
    costPrice: value.costPrice,
    presetId: value.pricingPresetId || undefined,
    installmentMonths: /^\d+$/.test(previewMonths) ? Number(previewMonths) : undefined,
    overrides: value.mode === 'CUSTOM' ? {
      expensePercent: value.customExpensePercent,
      profitPercent: value.customProfitPercent,
      discountBufferPercent: value.customDiscountBufferPercent,
      calculationMode: value.customCalculationMode,
      roundingMode: effectivePreset?.roundingMode ?? 'NONE',
      ...commonOverrides,
    } : commonOverrides,
  };
}

function customValuesFromPreset(preset: PricingPreset, includeInstallment: boolean): Partial<ProductFormPricingValues> {
  return {
    customExpensePercent: preset.expensePercent,
    customProfitPercent: preset.profitPercent,
    customDiscountBufferPercent: preset.discountBufferPercent,
    customCalculationMode: preset.calculationMode,
    ...(includeInstallment ? {
      customInstallmentMarkupPercent: preset.installmentMarkupPercent,
      customDownPaymentPercent: preset.downPaymentPercent,
      customInstallmentMonths: String(preset.defaultInstallmentMonths),
      previewInstallmentMonths: String(preset.defaultInstallmentMonths),
      previewDownPaymentPercent: preset.downPaymentPercent,
      previewInstallmentMarkupPercent: preset.installmentMarkupPercent,
    } : {}),
  };
}

function previewValuesFromPreset(preset: PricingPreset, includeInstallment: boolean): Partial<ProductFormPricingValues> {
  return includeInstallment ? {
    previewInstallmentMonths: String(preset.defaultInstallmentMonths),
    previewDownPaymentPercent: preset.downPaymentPercent,
    previewInstallmentMarkupPercent: preset.installmentMarkupPercent,
  } : {};
}

const Field: React.FC<{ label: string; value: string; set: (value: string) => void; error?: string; readOnly?: boolean }> = ({ label, value, set, error, readOnly = false }) => (
  <label className="block text-sm font-medium text-slate-700">
    {label}
    <input dir="ltr" inputMode="decimal" value={value} onChange={(event) => set(event.target.value)} readOnly={readOnly} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 read-only:bg-slate-100 read-only:text-slate-500" />
    {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
  </label>
);

const ModeButton: React.FC<{ active: boolean; onClick: () => void; children: React.ReactNode }> = ({ active, onClick, children }) => (
  <button
    type="button"
    aria-pressed={active}
    onClick={onClick}
    className={`rounded-lg border px-3 py-2 text-sm font-semibold ${active ? 'border-emerald-500 bg-emerald-50 text-emerald-800' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}
  >
    {children}
  </button>
);
