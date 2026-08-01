import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { ChevronDown, ChevronUp, Copy, Save } from 'lucide-react';
import { PricingPreviewCard } from '../../pricing/components/PricingPreviewCard';
import { usePricingPresets } from '../../pricing/hooks/usePricingPresets';
import { usePricingCalculation } from '../../pricing/hooks/usePricingPreview';
import { productPricingSchema, ProductPricingFormValues } from '../../pricing/schemas/pricing.schemas';
import { pricingLabels } from '../../pricing/utils/pricing-labels';
import { useUpdateProduct, useUpdateProductPricing } from '../hooks/useProducts';
import { Product } from '../types/product.types';

const empty: ProductPricingFormValues = {
  costPrice: '', pricingPresetId: '', useCustomPricing: false, installmentEnabled: false,
  customExpensePercent: '', customProfitPercent: '', customDiscountBufferPercent: '',
  customInstallmentMarkupPercent: '', customDownPaymentPercent: '', customInstallmentMonths: '3',
  customCalculationMode: 'COMPOUND', reason: '', accountPassword: '',
};
const customPercentFields = ['customExpensePercent','customProfitPercent','customDiscountBufferPercent','customInstallmentMarkupPercent','customDownPaymentPercent'] as const;

export const ProductPricingSection: React.FC<{ product: Product; initiallyOpen?: boolean }> = ({ product, initiallyOpen = false }) => {
  const [open, setOpen] = useState(initiallyOpen);
  const [form, setForm] = useState(empty);
  const [previewMonths, setPreviewMonths] = useState('');
  const [previewDownPayment, setPreviewDownPayment] = useState('');
  const [previewMarkup, setPreviewMarkup] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const presets = usePricingPresets({ pageSize: 100 });
  const save = useUpdateProductPricing();
  const updateProduct = useUpdateProduct();

  useEffect(() => {
    const config = product.pricing?.configuration;
    setForm({
      ...empty,
      costPrice: config?.costPrice ?? product.pricing?.costPrice ?? '',
      pricingPresetId: config?.pricingPresetId ?? product.pricing?.pricingPresetId ?? '',
      useCustomPricing: config?.useCustomPricing ?? product.pricing?.useCustomPricing ?? false,
      installmentEnabled: config?.installmentEnabled ?? product.pricing?.installmentEnabled ?? false,
      customExpensePercent: config?.customExpensePercent ?? '', customProfitPercent: config?.customProfitPercent ?? '',
      customDiscountBufferPercent: config?.customDiscountBufferPercent ?? '', customInstallmentMarkupPercent: config?.customInstallmentMarkupPercent ?? '',
      customDownPaymentPercent: config?.customDownPaymentPercent ?? '', customInstallmentMonths: String(config?.customInstallmentMonths ?? 3),
      customCalculationMode: config?.customCalculationMode ?? 'COMPOUND',
    });
  }, [product]);

  const selected = presets.data?.items.find((preset) => preset.id === form.pricingPresetId);
  const set = <K extends keyof ProductPricingFormValues>(field: K, value: ProductPricingFormValues[K]) => {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: '' }));
  };
  const toggleCustom = (enabled: boolean) => {
    if (enabled && selected) {
      setForm((current) => ({ ...current, useCustomPricing: true,
        customExpensePercent: selected.expensePercent, customProfitPercent: selected.profitPercent,
        customDiscountBufferPercent: selected.discountBufferPercent, customInstallmentMarkupPercent: selected.installmentMarkupPercent,
        customDownPaymentPercent: selected.downPaymentPercent, customInstallmentMonths: String(selected.defaultInstallmentMonths),
        customCalculationMode: selected.calculationMode,
      }));
    } else set('useCustomPricing', enabled);
  };

  const calculationInput = useMemo(() => form.costPrice ? {
    costPrice: form.costPrice, presetId: form.pricingPresetId || undefined,
    installmentMonths: form.installmentEnabled
      ? (/^\d+$/.test(previewMonths || form.customInstallmentMonths) ? Number(previewMonths || form.customInstallmentMonths) : undefined)
      : 1,
    overrides: {
      ...(form.useCustomPricing ? {
      expensePercent: form.customExpensePercent, profitPercent: form.customProfitPercent,
      discountBufferPercent: form.customDiscountBufferPercent, calculationMode: form.customCalculationMode,
      roundingMode: selected?.roundingMode ?? 'NONE' as const,
      } : {}),
      installmentMarkupPercent: form.installmentEnabled ? previewMarkup || form.customInstallmentMarkupPercent || selected?.installmentMarkupPercent : '0',
      downPaymentPercent: form.installmentEnabled ? previewDownPayment || form.customDownPaymentPercent || selected?.downPaymentPercent : '100',
    },
  } : null, [form, previewDownPayment, previewMarkup, previewMonths, selected]);
  const preview = usePricingCalculation(calculationInput);

  const submit = () => {
    const parsed = productPricingSchema.safeParse(form);
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((issue) => [String(issue.path[0]), issue.message])));
      return;
    }
    const value = parsed.data;
    save.mutate({ id: product.id, input: {
      costPrice: value.costPrice || null, pricingPresetId: value.pricingPresetId || null, useCustomPricing: value.useCustomPricing,
      installmentEnabled: value.installmentEnabled,
      customExpensePercent: value.customExpensePercent || null, customProfitPercent: value.customProfitPercent || null,
      customDiscountBufferPercent: value.customDiscountBufferPercent || null, customInstallmentMarkupPercent: value.customInstallmentMarkupPercent || null,
      customDownPaymentPercent: value.customDownPaymentPercent || null,
      customInstallmentMonths: value.customInstallmentMonths ? Number(value.customInstallmentMonths) : null,
      customCalculationMode: value.customCalculationMode, reason: value.reason, accountPassword: value.accountPassword,
    } }, { onSuccess: () => toast.success('Product pricing updated / تم تحديث تسعير المنتج'), onError: () => toast.error('Unable to update product pricing') });
  };
  const copyCalculated = () => {
    if (!preview.data?.cashPrice) return;
    if (!form.reason.trim() || !form.accountPassword) {
      setErrors((current) => ({ ...current, reason: !form.reason.trim() ? 'Reason is required' : current.reason, accountPassword: !form.accountPassword ? 'Password is required' : current.accountPassword }));
      return;
    }
    updateProduct.mutate({ id: product.id, input: { price: preview.data.cashPrice, reason: form.reason, accountPassword: form.accountPassword } }, { onSuccess: () => toast.success('Calculated price copied to manual price') });
  };

  return <section className="rounded-lg border border-slate-200 bg-slate-50">
    <button type="button" onClick={() => setOpen((value) => !value)} className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold"><span>{pricingLabels.pricingPreview}</span>{open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</button>
    {open && <div className="grid gap-5 border-t border-slate-200 p-4 xl:grid-cols-[minmax(0,1fr)_minmax(300px,0.8fr)]">
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2"><Field label={pricingLabels.costPrice} value={form.costPrice} set={(value) => set('costPrice', value)} error={errors.costPrice} /><label className="text-sm font-medium">{pricingLabels.pricingPresets}<select value={form.pricingPresetId} onChange={(event) => set('pricingPresetId', event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"><option value="">Default preset / الصيغة الافتراضية</option>{presets.data?.items.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}{!preset.isActive ? ' (archived)' : ''}</option>)}</select></label></div>
        {selected && !selected.isActive && <p className="rounded bg-amber-50 p-2 text-xs text-amber-800">Archived preset remains calculable / الصيغة المؤرشفة ما زالت قابلة للحساب</p>}
        <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={form.useCustomPricing} onChange={(event) => toggleCustom(event.target.checked)} />{pricingLabels.useCustomPricing}</label>
        <label className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-3"><input type="checkbox" checked={form.installmentEnabled} onChange={(event) => set('installmentEnabled', event.target.checked)} className="mt-0.5 h-4 w-4"/><span><span className="block text-sm font-semibold">Offer installment payment / إتاحة الدفع بالتقسيط</span><span className="text-xs font-normal text-slate-500">Enable only for products that can be sold in installments / فعّل فقط للمنتجات المتاحة بالتقسيط.</span></span></label>
        {form.useCustomPricing && <div className="grid gap-3 sm:grid-cols-2">{customPercentFields.filter((field) => form.installmentEnabled || !['customInstallmentMarkupPercent','customDownPaymentPercent'].includes(field)).map((field) => <Field key={field} label={`${field.replace('custom','').replace('Percent','')} %`} value={form[field]} set={(value) => set(field, value)} error={errors[field]} />)}{form.installmentEnabled&&<Field label={pricingLabels.installmentMonths} value={form.customInstallmentMonths} set={(value) => set('customInstallmentMonths', value)} error={errors.customInstallmentMonths} />}<label className="text-sm font-medium">{pricingLabels.calculationMode}<select value={form.customCalculationMode} onChange={(event) => set('customCalculationMode', event.target.value as 'COMPOUND'|'SIMPLE')} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"><option value="COMPOUND">{pricingLabels.compound}</option><option value="SIMPLE">{pricingLabels.simple}</option></select></label></div>}
        <div className="grid gap-3 sm:grid-cols-2"><Field label="Reason / السبب" value={form.reason} set={(value) => set('reason', value)} error={errors.reason} auto /><Field label="Account Password / كلمة مرور الحساب" value={form.accountPassword} set={(value) => set('accountPassword', value)} error={errors.accountPassword} type="password" /></div>
        <div className="flex flex-wrap gap-2"><button type="button" onClick={submit} disabled={save.isPending} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white"><Save className="h-4 w-4" />Save Pricing / حفظ التسعير</button>{preview.data?.cashPrice && preview.data.cashPrice !== product.price && <button type="button" onClick={copyCalculated} className="inline-flex items-center gap-2 rounded-lg border border-emerald-300 px-4 py-2 text-sm font-semibold text-emerald-700"><Copy className="h-4 w-4" />Use calculated price / اعتماد السعر المحسوب</button>}</div>
      </div>
      <div className="space-y-3">{form.installmentEnabled&&<div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-1"><Field label="Preview Months / أشهر المعاينة" value={previewMonths} set={setPreviewMonths} /><Field label="Preview Down Payment % / دفعة المعاينة" value={previewDownPayment} set={setPreviewDownPayment} /><Field label="Preview Markup % / زيادة المعاينة" value={previewMarkup} set={setPreviewMarkup} /></div>}<PricingPreviewCard preview={preview.data} loading={preview.isLoading} stale={preview.isFetching} costPrice={form.costPrice} percents={{ expensePercent: form.customExpensePercent, profitPercent: form.customProfitPercent, discountBufferPercent: form.customDiscountBufferPercent, downPaymentPercent: previewDownPayment || form.customDownPaymentPercent }} showInstallment={form.installmentEnabled} /></div>
    </div>}
  </section>;
};

const Field: React.FC<{ label:string; value:string; set:(value:string)=>void; error?:string; auto?:boolean; type?:string }> = ({ label, value, set, error, auto, type='text' }) => <label className="block text-sm font-medium text-slate-700">{label}<input dir={auto ? 'auto' : 'ltr'} type={type} value={value} onChange={(event) => set(event.target.value)} className="user-text-input mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />{error && <span className="mt-1 block text-xs text-red-600">{error}</span>}</label>;
