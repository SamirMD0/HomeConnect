import React, { useMemo } from 'react';
import { PricingPreviewCard } from '../../pricing/components/PricingPreviewCard';
import { usePricingPresets } from '../../pricing/hooks/usePricingPresets';
import { usePricingCalculation } from '../../pricing/hooks/usePricingPreview';
import { ProductPricingConfigurationFormValues } from '../../pricing/schemas/pricing.schemas';
import { PricingCalculateInput, PricingPreset } from '../../pricing/types/pricing.types';

export interface ProductFormPricingValues extends ProductPricingConfigurationFormValues {
  previewInstallmentMonths: string;
  previewDownPaymentPercent: string;
  previewInstallmentMarkupPercent: string;
}

export const emptyProductFormPricing: ProductFormPricingValues = {
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
  errors?: Record<string, string>;
}

export const ProductFormPricingPanel: React.FC<ProductFormPricingPanelProps> = ({ value, onChange, errors = {} }) => {
  const presets = usePricingPresets({ isActive: true, pageSize: 100 });
  const activePresets = presets.data?.items ?? [];
  const effectivePreset = activePresets.find((preset) => preset.id === value.pricingPresetId)
    ?? (!value.pricingPresetId ? activePresets.find((preset) => preset.isDefault) : undefined);
  const previewMonths = value.installmentEnabled ? value.previewInstallmentMonths || String(effectivePreset?.defaultInstallmentMonths ?? '') : '1';
  const previewDownPayment = value.installmentEnabled ? value.previewDownPaymentPercent || effectivePreset?.downPaymentPercent || '' : '100';
  const previewMarkup = value.installmentEnabled ? value.previewInstallmentMarkupPercent || effectivePreset?.installmentMarkupPercent || '' : '0';

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
      ...(value.useCustomPricing && nextPreset ? customValuesFromPreset(nextPreset) : {}),
    });
  };
  const toggleCustom = (enabled: boolean) => {
    onChange({
      ...value,
      useCustomPricing: enabled,
      ...(enabled && effectivePreset ? customValuesFromPreset(effectivePreset) : {}),
    });
  };

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

      <label className="flex items-center gap-2 text-sm font-medium text-slate-800">
        <input type="checkbox" checked={value.useCustomPricing} onChange={(event) => toggleCustom(event.target.checked)} />
        Use Custom Pricing / تسعير مخصص
      </label>

      <label className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-3">
        <input
          type="checkbox"
          checked={value.installmentEnabled}
          onChange={(event) => set('installmentEnabled', event.target.checked)}
          className="mt-0.5 h-4 w-4"
        />
        <span>
          <span className="block text-sm font-semibold text-slate-800">Offer installment payment / إتاحة الدفع بالتقسيط</span>
          <span className="mt-0.5 block text-xs text-slate-500">Enable only when this product should be sold with an installment option / فعّل هذا الخيار فقط للمنتجات المتاحة بالتقسيط.</span>
        </span>
      </label>

      {value.useCustomPricing && <div className="grid gap-3 rounded-lg border border-slate-200 bg-white p-3 sm:grid-cols-2">
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

      {value.installmentEnabled && <div>
        <h4 className="text-sm font-semibold text-slate-800">Pricing Preview Overrides / تعديلات معاينة السعر</h4>
        <p className="mt-1 text-xs text-slate-500">Preset defaults remain unchanged unless custom pricing is enabled / لا تتغير الصيغة الأصلية إلا عند تفعيل التسعير المخصص.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <Field label="Preview Installment Months / عدد أشهر التقسيط للمعاينة" value={previewMonths} set={(next) => set('previewInstallmentMonths', next)} error={errors.previewInstallmentMonths || errors.customInstallmentMonths} />
          <Field label="Preview Down Payment % / الدفعة الأولى للمعاينة" value={previewDownPayment} set={(next) => set('previewDownPaymentPercent', next)} error={errors.previewDownPaymentPercent || errors.customDownPaymentPercent} />
          <Field label="Preview Installment Markup % / زيادة التقسيط للمعاينة" value={previewMarkup} set={(next) => set('previewInstallmentMarkupPercent', next)} error={errors.previewInstallmentMarkupPercent || errors.customInstallmentMarkupPercent} />
        </div>
      </div>}

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
    </section>
  );
};

export function buildProductPricingCalculationInput(
  value: ProductFormPricingValues,
  effectivePreset?: PricingPreset
): PricingCalculateInput | null {
  if (!value.costPrice) return null;
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
    overrides: value.useCustomPricing ? {
      expensePercent: value.customExpensePercent,
      profitPercent: value.customProfitPercent,
      discountBufferPercent: value.customDiscountBufferPercent,
      calculationMode: value.customCalculationMode,
      roundingMode: effectivePreset?.roundingMode ?? 'NONE',
      ...commonOverrides,
    } : commonOverrides,
  };
}

function customValuesFromPreset(preset: PricingPreset): Partial<ProductFormPricingValues> {
  return {
    customExpensePercent: preset.expensePercent,
    customProfitPercent: preset.profitPercent,
    customDiscountBufferPercent: preset.discountBufferPercent,
    customInstallmentMarkupPercent: preset.installmentMarkupPercent,
    customDownPaymentPercent: preset.downPaymentPercent,
    customInstallmentMonths: String(preset.defaultInstallmentMonths),
    customCalculationMode: preset.calculationMode,
    previewInstallmentMonths: String(preset.defaultInstallmentMonths),
    previewDownPaymentPercent: preset.downPaymentPercent,
    previewInstallmentMarkupPercent: preset.installmentMarkupPercent,
  };
}

const Field: React.FC<{ label: string; value: string; set: (value: string) => void; error?: string }> = ({ label, value, set, error }) => (
  <label className="block text-sm font-medium text-slate-700">
    {label}
    <input dir="ltr" inputMode="decimal" value={value} onChange={(event) => set(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2" />
    {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
  </label>
);
