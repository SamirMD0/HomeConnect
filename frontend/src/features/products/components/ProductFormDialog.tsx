import React, { FormEvent, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Modal } from '../../../components/ui/Modal';
import { useAuth } from '../../../hooks/useAuth';
import { businessLabels } from '../../../shared/labels/business-labels';
import { productCorrectionSchema, productFormSchema, ProductFormValues } from '../schemas/product.schemas';
import { LabelBarcodeSource, Product, ProductSpecification, ProductStockInput, UpdateProductInput } from '../types/product.types';
import { normalizeProductError } from '../utils/product-form-errors';
import { productLabels } from '../utils/product-labels';
import { useCheckProductDuplicate, useCreateProduct, useRemoveProductImage, useUpdateProduct, useUpdateProductPricing, useUpdateProductStock, useUploadProductImage } from '../hooks/useProducts';
import { ProductImageField } from './ProductImageField';
import { productPricingConfigurationSchema, productPricingPreviewOverridesSchema } from '../../pricing/schemas/pricing.schemas';
import { ProductPricingConfigurationInput } from '../../pricing/types/pricing.types';
import { ProductDuplicateWarning } from './ProductDuplicateWarning';
import { emptyProductFormPricing, ProductFormPricingPanel, ProductFormPricingValues } from './ProductFormPricingPanel';
import { ProductStockSection } from './ProductStockSection';
import { ProductSpecificationsEditor } from './ProductSpecificationsEditor';

interface ProductFormDialogProps {
  open: boolean;
  product?: Product | null;
  onClose: () => void;
  onViewDuplicate: (id: string) => void;
}

const emptyForm: ProductFormValues = { name: '', model: '', brand: '', barcode: '', price: '', discount: '', imageUrl: '', notes: '' };
const sensitiveFields = ['name', 'model', 'brand', 'barcode', 'price', 'discount'] as const;

export const ProductFormDialog: React.FC<ProductFormDialogProps> = ({ open, product, onClose, onViewDuplicate }) => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const create = useCreateProduct();
  const updateProduct = useUpdateProduct();
  const updatePricing = useUpdateProductPricing();
  const updateStock = useUpdateProductStock();
  const uploadImage = useUploadProductImage();
  const removeImage = useRemoveProductImage();
  const duplicate = useCheckProductDuplicate();
  const resetDuplicate = duplicate.reset;
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [form, setForm] = useState<ProductFormValues>(emptyForm);
  const [pricing, setPricing] = useState<ProductFormPricingValues>(emptyProductFormPricing);
  const [stock, setStock] = useState<ProductStockInput>({ trackStock: false, stockQuantity: 0, lowStockThreshold: null });
  const [specifications, setSpecifications] = useState<ProductSpecification[]>([]);
  const [specificationNotes, setSpecificationNotes] = useState('');
  const [labelBarcodeSource, setLabelBarcodeSource] = useState<LabelBarcodeSource>('SKU');
  const [reason, setReason] = useState('');
  const [accountPassword, setAccountPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState('');
  const [duplicateDismissed, setDuplicateDismissed] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(product ? {
      name: product.name,
      model: product.model,
      brand: product.brand ?? '',
      barcode: product.barcode ?? '',
      price: product.price ?? '',
      discount: product.discount ?? '',
      imageUrl: product.imageUrl ?? '',
      notes: product.notes ?? '',
    } : emptyForm);
    setImageFile(null);
    setPricing(productPricingForm(product));
    setStock(product ? { trackStock: product.trackStock, stockQuantity: product.stockQuantity, lowStockThreshold: product.lowStockThreshold } : { trackStock: false, stockQuantity: 0, lowStockThreshold: null });
    setSpecifications(product?.specifications ?? []);
    setSpecificationNotes(product?.specificationNotes ?? '');
    setLabelBarcodeSource(product?.labelBarcodeSource ?? 'SKU');
    setReason('');
    setAccountPassword('');
    setErrors({});
    setServerError('');
    setDuplicateDismissed(false);
    resetDuplicate();
  }, [open, product, resetDuplicate]);

  const sensitiveChanged = useMemo(() => Boolean(product && (sensitiveFields.some((field) => normalized(form[field]) !== normalized(product[field])) || labelBarcodeSource !== product.labelBarcodeSource)), [form, labelBarcodeSource, product]);
  const stockChanged = useMemo(() => Boolean(product && JSON.stringify(stock) !== JSON.stringify({ trackStock: product.trackStock, stockQuantity: product.stockQuantity, lowStockThreshold: product.lowStockThreshold })), [product, stock]);
  const pricingInput = useMemo(() => pricingConfigurationInput(pricing), [pricing]);
  const pricingChanged = useMemo(() => Boolean(product && isProductPricingChanged(product, pricingInput)), [pricingInput, product]);
  const pending = create.isPending || updateProduct.isPending || updatePricing.isPending || updateStock.isPending || uploadImage.isPending;

  const set = (field: keyof ProductFormValues, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: '' }));
    if (field === 'name' || field === 'model' || field === 'brand') {
      setDuplicateDismissed(false);
      duplicate.reset();
    }
  };

  const checkDuplicate = () => {
    if (product || !form.name.trim() || !form.model.trim()) return;
    duplicate.mutate({ name: form.name.trim(), model: form.model.trim(), brand: form.brand.trim() || null });
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setServerError('');
    const parsed = productFormSchema.safeParse(form);
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((issue) => [String(issue.path[0]), issue.message])));
      return;
    }
    const parsedPricing = productPricingConfigurationSchema.safeParse(pricingForValidation(pricing));
    const parsedPreviewOverrides = productPricingPreviewOverridesSchema.safeParse(pricing);
    if (isAdmin && (!parsedPricing.success || !parsedPreviewOverrides.success)) {
      const pricingIssues = parsedPricing.success ? [] : parsedPricing.error.issues;
      const previewIssues = parsedPreviewOverrides.success ? [] : parsedPreviewOverrides.error.issues;
      setErrors((current) => ({ ...current, ...Object.fromEntries([...pricingIssues, ...previewIssues].map((issue) => [String(issue.path[0]), issue.message])) }));
      return;
    }
    if (!Number.isInteger(stock.stockQuantity) || stock.stockQuantity < 0 || (stock.lowStockThreshold != null && (!Number.isInteger(stock.lowStockThreshold) || stock.lowStockThreshold < 0))) {
      setErrors((current) => ({ ...current, stockQuantity: 'Stock values must be non-negative whole numbers' }));
      return;
    }
    if (sensitiveChanged || pricingChanged || stockChanged) {
      const correction = productCorrectionSchema.safeParse({ reason, accountPassword });
      if (!correction.success) {
        setErrors((current) => ({ ...current, ...Object.fromEntries(correction.error.issues.map((issue) => [String(issue.path[0]), issue.message])) }));
        return;
      }
    }

    const values = parsed.data;
    if (!product) {
      try {
        // The image endpoint is keyed by product id, so a chosen file uploads
        // only once the product row exists.
        const created = await create.mutateAsync(toCreateInput(values, isAdmin ? pricingInput : undefined, stock, specifications, specificationNotes, labelBarcodeSource));
        if (imageFile) await uploadImage.mutateAsync({ id: created.id, file: imageFile });
        toast.success('Product created / تم إنشاء المنتج');
        onClose();
      } catch (error) { handleError(error); }
      return;
    }

    const input = changedInput(product, values, specifications, specificationNotes, labelBarcodeSource);
    if (Object.keys(input).length === 0 && !pricingChanged && !stockChanged && !imageFile) {
      setServerError('No product changes were entered / لم يتم إدخال أي تعديل');
      return;
    }
    if (sensitiveChanged) Object.assign(input, { reason: reason.trim(), accountPassword });
    try {
      if (Object.keys(input).length > 0) await updateProduct.mutateAsync({ id: product.id, input });
      if (pricingChanged) await updatePricing.mutateAsync({ id: product.id, input: { ...pricingInput, reason: reason.trim(), accountPassword } });
      if (stockChanged) await updateStock.mutateAsync({ id: product.id, input: { ...stock, reason: reason.trim(), accountPassword } });
      if (imageFile) await uploadImage.mutateAsync({ id: product.id, file: imageFile });
      toast.success('Product updated / تم تعديل المنتج');
      onClose();
    } catch (error) { handleError(error); }
  };

  const removeSavedImage = async () => {
    if (!product?.image) return;
    try {
      await removeImage.mutateAsync(product.id);
      toast.success('Product image removed / تم حذف صورة المنتج');
    } catch (error) { handleError(error); }
  };

  const handleError = (error: unknown) => {
    const normalizedError = normalizeProductError(error);
    setServerError(normalizedError.message);
    setErrors((current) => ({ ...current, ...normalizedError.fieldErrors }));
  };

  return (
    <Modal isOpen={open} onClose={onClose} title={product ? businessLabels.product.editProduct : businessLabels.product.addProduct} maxWidth="max-w-4xl">
      <form onSubmit={submit} className="space-y-5">
        {serverError && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{serverError}</p>}
        <div>
          <h3 className="font-semibold text-slate-900">Basic Product Info / معلومات المنتج الأساسية</h3>
          <p className="mt-1 text-xs text-slate-500">Product identity and notes / بيانات المنتج وملاحظاته</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {product && <div className="sm:col-span-2"><span className="text-xs font-medium text-slate-500">SKU</span><div className="mt-1 inline-flex rounded-md bg-slate-100 px-3 py-2 font-mono text-sm font-bold">{product.sku}</div></div>}
          <Field label={`${businessLabels.product.name} *`} value={form.name} onChange={(value) => set('name', value)} error={errors.name} disabled={Boolean(product && !isAdmin)} />
          <Field label={`${businessLabels.product.model} *`} value={form.model} onChange={(value) => set('model', value)} onBlur={checkDuplicate} error={errors.model} disabled={Boolean(product && !isAdmin)} />
          <Field label={businessLabels.product.brand} value={form.brand} onChange={(value) => set('brand', value)} onBlur={checkDuplicate} error={errors.brand} disabled={Boolean(product && !isAdmin)} />
          <Field label={businessLabels.product.barcode} value={form.barcode} onChange={(value) => set('barcode', value)} error={errors.barcode} disabled={Boolean(product && !isAdmin)} dir="ltr" />
          <label className="block text-sm font-medium text-slate-700">Label barcode source / مصدر باركود الملصق<select value={labelBarcodeSource} onChange={(event) => setLabelBarcodeSource(event.target.value as LabelBarcodeSource)} disabled={Boolean(product && !isAdmin)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 disabled:bg-slate-100"><option value="SKU">HomeConnect SKU</option><option value="MANUFACTURER" disabled={!form.barcode}>Manufacturer barcode / باركود الشركة</option></select></label>
          <Field label={businessLabels.product.notes} value={form.notes} onChange={(value) => set('notes', value)} error={errors.notes} textarea className="sm:col-span-2" />
        </div>

        <ProductStockSection value={stock} onChange={setStock} />
        {errors.stockQuantity && <p className="text-xs text-red-600">{errors.stockQuantity}</p>}
        <ProductSpecificationsEditor value={specifications} notes={specificationNotes} onChange={setSpecifications} onNotesChange={setSpecificationNotes} />

        <ProductImageField
          product={product}
          url={form.imageUrl}
          onUrlChange={(value) => set('imageUrl', value)}
          file={imageFile}
          onFileChange={setImageFile}
          onRemoveSaved={removeSavedImage}
          removing={removeImage.isPending}
          error={errors.imageUrl}
        />

        <details className="rounded-lg border border-slate-200 bg-white p-3">
          <summary className="cursor-pointer text-sm font-semibold text-slate-700">Legacy Manual Selling Fields / حقول سعر البيع اليدوي القديمة</summary>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <Field label="Manual Selling Price / سعر البيع اليدوي" value={form.price} onChange={(value) => set('price', value)} error={errors.price} disabled={Boolean(product && !isAdmin)} inputMode="decimal" dir="ltr" />
            <Field label="Manual Discount Amount / قيمة الخصم اليدوي" value={form.discount} onChange={(value) => set('discount', value)} error={errors.discount} disabled={Boolean(product && !isAdmin)} inputMode="decimal" dir="ltr" />
          </div>
        </details>

        {!product && !duplicateDismissed && duplicate.data && <ProductDuplicateWarning matches={duplicate.data} onContinue={() => setDuplicateDismissed(true)} onView={onViewDuplicate} />}

        {product && !isAdmin && <p className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">Employees may update product notes. Product identity and pricing require an administrator / يمكن للموظف تعديل الملاحظات فقط.</p>}

        {isAdmin && <ProductFormPricingPanel value={pricing} onChange={setPricing} errors={errors} />}

        {(sensitiveChanged || pricingChanged || stockChanged) && <div className="grid gap-4 rounded-lg border border-amber-200 bg-amber-50 p-4 sm:grid-cols-2">
          <Field label={`${productLabels.reason} *`} value={reason} onChange={setReason} error={errors.reason} textarea />
          <Field label={`${productLabels.accountPassword} *`} value={accountPassword} onChange={setAccountPassword} error={errors.accountPassword} type="password" />
        </div>}

        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-4">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 font-medium">{businessLabels.common.cancel}</button>
          <button disabled={pending} className="rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white disabled:opacity-50">{pending ? 'Saving…' : businessLabels.common.saveChanges}</button>
        </div>
      </form>
    </Modal>
  );
};

interface FieldProps {
  label: string; value: string; onChange: (value: string) => void; error?: string;
  disabled?: boolean; textarea?: boolean; type?: string; inputMode?: 'text' | 'decimal'; dir?: 'auto' | 'ltr'; className?: string; onBlur?: () => void;
}

const Field: React.FC<FieldProps> = ({ label, value, onChange, error, disabled, textarea, type = 'text', inputMode = 'text', dir = 'auto', className = '', onBlur }) => (
  <label className={`block text-sm font-medium text-slate-700 ${className}`}>
    {label}
    {textarea
      ? <textarea value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled} dir={dir} className="user-text-input mt-1 min-h-24 w-full rounded-lg border border-slate-300 px-3 py-2 disabled:bg-slate-100" />
      : <input value={value} onChange={(event) => onChange(event.target.value)} onBlur={onBlur} disabled={disabled} type={type} inputMode={inputMode} dir={dir} className="user-text-input mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 disabled:bg-slate-100" />}
    {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
  </label>
);

function normalized(value: unknown): string {
  return value == null ? '' : String(value).trim();
}

function toCreateInput(values: ProductFormValues, pricing?: ProductPricingConfigurationInput, stock?: ProductStockInput, specifications: ProductSpecification[] = [], specificationNotes = '', labelBarcodeSource: LabelBarcodeSource = 'SKU') {
  return {
    name: values.name.trim(), model: values.model.trim(), brand: values.brand.trim() || null,
    barcode: values.barcode.trim() || null, price: values.price.trim() || null,
    discount: values.discount.trim() || null, imageUrl: values.imageUrl.trim() || null,
    notes: values.notes.trim() || null,
    labelBarcodeSource, ...stock,
    specifications: cleanSpecifications(specifications), specificationNotes: specificationNotes.trim() || null,
    ...pricing,
  };
}

function changedInput(product: Product, values: ProductFormValues, specifications: ProductSpecification[], specificationNotes: string, labelBarcodeSource: LabelBarcodeSource): UpdateProductInput {
  const next = toCreateInput(values);
  const input: UpdateProductInput = {};
  for (const key of ['name','model','brand','barcode','price','discount','imageUrl','notes'] as const) {
    if (normalized(next[key]) !== normalized(product[key])) input[key] = next[key] as never;
  }
  const cleaned = cleanSpecifications(specifications);
  if (JSON.stringify(cleaned) !== JSON.stringify(product.specifications)) input.specifications = cleaned;
  if (specificationNotes.trim() !== (product.specificationNotes ?? '')) input.specificationNotes = specificationNotes.trim() || null;
  if (labelBarcodeSource !== product.labelBarcodeSource) input.labelBarcodeSource = labelBarcodeSource;
  return input;
}

const cleanSpecifications = (entries: ProductSpecification[]) => entries.map((entry) => ({ label: entry.label.trim(), value: entry.value.trim() })).filter((entry) => entry.label && entry.value);

function productPricingForm(product?: Product | null): ProductFormPricingValues {
  if (!product) return { ...emptyProductFormPricing };
  const config = product.pricing?.configuration;
  const customMonths = config?.customInstallmentMonths == null ? '' : String(config.customInstallmentMonths);
  return {
    ...emptyProductFormPricing,
    costPrice: config?.costPrice ?? product.pricing?.costPrice ?? '',
    pricingPresetId: config?.pricingPresetId ?? product.pricing?.pricingPresetId ?? '',
    useCustomPricing: config?.useCustomPricing ?? product.pricing?.useCustomPricing ?? false,
    customExpensePercent: config?.customExpensePercent ?? '',
    customProfitPercent: config?.customProfitPercent ?? '',
    customDiscountBufferPercent: config?.customDiscountBufferPercent ?? '',
    customInstallmentMarkupPercent: config?.customInstallmentMarkupPercent ?? '',
    customDownPaymentPercent: config?.customDownPaymentPercent ?? '',
    customInstallmentMonths: customMonths,
    customCalculationMode: config?.customCalculationMode ?? 'COMPOUND',
    previewInstallmentMonths: customMonths,
    previewDownPaymentPercent: config?.customDownPaymentPercent ?? '',
    previewInstallmentMarkupPercent: config?.customInstallmentMarkupPercent ?? '',
  };
}

function pricingForValidation(values: ProductFormPricingValues) {
  return {
    ...values,
    customInstallmentMonths: values.useCustomPricing ? values.previewInstallmentMonths : values.customInstallmentMonths,
    customDownPaymentPercent: values.useCustomPricing ? values.previewDownPaymentPercent : values.customDownPaymentPercent,
    customInstallmentMarkupPercent: values.useCustomPricing ? values.previewInstallmentMarkupPercent : values.customInstallmentMarkupPercent,
  };
}

function pricingConfigurationInput(values: ProductFormPricingValues): ProductPricingConfigurationInput {
  if (!values.costPrice.trim()) {
    return {
      costPrice: null,
      pricingPresetId: null,
      useCustomPricing: false,
      customExpensePercent: null,
      customProfitPercent: null,
      customDiscountBufferPercent: null,
      customInstallmentMarkupPercent: null,
      customDownPaymentPercent: null,
      customInstallmentMonths: null,
      customCalculationMode: null,
    };
  }
  const input: ProductPricingConfigurationInput = {
    costPrice: values.costPrice.trim(),
    pricingPresetId: values.pricingPresetId || null,
    useCustomPricing: values.useCustomPricing,
    customExpensePercent: null,
    customProfitPercent: null,
    customDiscountBufferPercent: null,
    customInstallmentMarkupPercent: null,
    customDownPaymentPercent: null,
    customInstallmentMonths: null,
    customCalculationMode: null,
  };
  if (!values.useCustomPricing) return input;
  return {
    ...input,
    customExpensePercent: values.customExpensePercent,
    customProfitPercent: values.customProfitPercent,
    customDiscountBufferPercent: values.customDiscountBufferPercent,
    customInstallmentMarkupPercent: values.previewInstallmentMarkupPercent,
    customDownPaymentPercent: values.previewDownPaymentPercent,
    customInstallmentMonths: /^\d+$/.test(values.previewInstallmentMonths) ? Number(values.previewInstallmentMonths) : null,
    customCalculationMode: values.customCalculationMode,
  };
}

function isProductPricingChanged(product: Product, next: ProductPricingConfigurationInput): boolean {
  const current = product.pricing?.configuration;
  const comparableCurrent: ProductPricingConfigurationInput = {
    costPrice: current?.costPrice ?? product.pricing?.costPrice ?? null,
    pricingPresetId: current?.pricingPresetId ?? product.pricing?.pricingPresetId ?? null,
    useCustomPricing: current?.useCustomPricing ?? product.pricing?.useCustomPricing ?? false,
    customExpensePercent: current?.customExpensePercent ?? null,
    customProfitPercent: current?.customProfitPercent ?? null,
    customDiscountBufferPercent: current?.customDiscountBufferPercent ?? null,
    customInstallmentMarkupPercent: current?.customInstallmentMarkupPercent ?? null,
    customDownPaymentPercent: current?.customDownPaymentPercent ?? null,
    customInstallmentMonths: current?.customInstallmentMonths ?? null,
    customCalculationMode: current?.customCalculationMode ?? null,
  };
  return (Object.keys(comparableCurrent) as Array<keyof ProductPricingConfigurationInput>)
    .some((field) => normalized(comparableCurrent[field]) !== normalized(next[field]));
}
