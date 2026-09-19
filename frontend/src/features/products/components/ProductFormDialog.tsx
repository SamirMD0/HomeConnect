import React, { FormEvent, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Button, FormField, Input, Modal, SectionHeader, Select, Textarea } from '../../../components/ui';
import { useAuth } from '../../../hooks/useAuth';
import { businessLabels } from '../../../shared/labels/business-labels';
import { productCorrectionSchema, productFormSchema, productPricingModeFormSchema, ProductFormValues } from '../schemas/product.schemas';
import { LabelBarcodeSource, Product, ProductDuplicateMatch, ProductDuplicateQuery, ProductSpecification, ProductStockInput, UpdateProductInput } from '../types/product.types';
import { firstUnrenderedProductFieldError, normalizeProductError } from '../utils/product-form-errors';
import { productLabels } from '../utils/product-labels';
import { useCheckProductDuplicate, useCreateProduct, useRemoveProductImage, useUpdateProduct, useUpdateProductPricing, useUpdateProductStock, useUploadProductImage } from '../hooks/useProducts';
import { ProductImageField } from './ProductImageField';
import { productPricingConfigurationSchema, productPricingPreviewOverridesSchema } from '../../pricing/schemas/pricing.schemas';
import { ProductPricingConfigurationInput } from '../../pricing/types/pricing.types';
import { ProductDuplicateInlineError, ProductDuplicateWarning } from './ProductDuplicateWarning';
import { emptyProductFormPricing, ProductFormPricingPanel, ProductFormPricingValues } from './ProductFormPricingPanel';
import { ProductStockSection } from './ProductStockSection';
import { ProductSpecificationsEditor } from './ProductSpecificationsEditor';
import { VerifyOpeningCountDialog } from '../../inventory/components/VerifyOpeningCountDialog';
import { BrandCombobox } from './BrandCombobox';

interface ProductFormDialogProps {
  open: boolean;
  product?: Product | null;
  onClose: () => void;
  onViewDuplicate: (id: string) => void;
}

const emptyForm: ProductFormValues = { name: '', model: '', brand: '', barcode: '', price: '', discount: '', imageUrl: '', notes: '' };

export const ProductFormDialog: React.FC<ProductFormDialogProps> = ({ open, product, onClose, onViewDuplicate }) => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const create = useCreateProduct();
  const updateProduct = useUpdateProduct();
  const updatePricing = useUpdateProductPricing();
  const updateStock = useUpdateProductStock();
  const uploadImage = useUploadProductImage();
  const removeImage = useRemoveProductImage();
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [savedImageRemoved, setSavedImageRemoved] = useState(false);
  const [form, setForm] = useState<ProductFormValues>(emptyForm);
  const [pricing, setPricing] = useState<ProductFormPricingValues>(emptyProductFormPricing);
  const [stock, setStock] = useState<ProductStockInput>({ trackStock: false, stockQuantity: 0, lowStockThreshold: null });
  const [specifications, setSpecifications] = useState<ProductSpecification[]>([]);
  const [specificationNotes, setSpecificationNotes] = useState('');
  const [labelBarcodeSource, setLabelBarcodeSource] = useState<LabelBarcodeSource>('AUTO');
  const [reason, setReason] = useState('');
  const [accountPassword, setAccountPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState('');
  const [notice, setNotice] = useState('');
  const [duplicateDismissed, setDuplicateDismissed] = useState(false);
  const [openingCountProduct, setOpeningCountProduct] = useState<{ id: string; name: string } | null>(null);
  const duplicateQuery = useMemo(() => productDuplicateQueryForForm(form, product), [form, product]);
  const duplicate = useCheckProductDuplicate(open ? duplicateQuery : null);
  const duplicateMatches = duplicate.data ?? [];
  const duplicateBlocked = hasBlockingProductDuplicate(duplicateMatches);

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
    setSavedImageRemoved(false);
    setPricing(productPricingForm(product));
    setStock(product ? { trackStock: product.trackStock, stockQuantity: product.stockQuantity, lowStockThreshold: product.lowStockThreshold } : { trackStock: false, stockQuantity: 0, lowStockThreshold: null });
    setSpecifications(product?.specifications ?? []);
    setSpecificationNotes(product?.specificationNotes ?? '');
    setLabelBarcodeSource(product?.labelBarcodeSource ?? 'AUTO');
    setReason('');
    setAccountPassword('');
    setErrors({});
    setServerError('');
    setNotice('');
    setDuplicateDismissed(false);
  }, [open, product]);

  const stockChanged = useMemo(() => Boolean(product && (
    stock.trackStock !== product.trackStock || stock.lowStockThreshold !== product.lowStockThreshold
  )), [product, stock]);
  const pricingInput = useMemo(() => buildProductPricingConfigurationInput(pricing), [pricing]);
  const pricingChanged = useMemo(() => shouldUpdateProductPricing(isAdmin, product, pricingInput), [isAdmin, pricingInput, product]);
  const pending = create.isPending || updateProduct.isPending || updatePricing.isPending || updateStock.isPending || uploadImage.isPending || removeImage.isPending;

  const set = (field: keyof ProductFormValues, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: '' }));
    if (field === 'name' || field === 'model' || field === 'brand' || field === 'barcode') {
      setDuplicateDismissed(false);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setServerError('');
    setNotice('');
    if (duplicateBlocked) {
      setServerError('Change the barcode already used by another product before saving / غيّر الباركود المستخدم في منتج آخر قبل الحفظ');
      return;
    }
    const parsed = productFormSchema.safeParse(form);
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((issue) => [String(issue.path[0]), issue.message])));
      return;
    }
    const parsedPricing = productPricingConfigurationSchema.safeParse(pricingForValidation(pricing));
    const parsedPreviewOverrides = pricing.installmentEnabled
      ? productPricingPreviewOverridesSchema.safeParse(pricing)
      : { success: true as const };
    const parsedMode = productPricingModeFormSchema.safeParse({ mode: pricing.mode, costPrice: pricing.costPrice, price: parsed.data.price });
    if (isAdmin && (!parsedPricing.success || !parsedPreviewOverrides.success || !parsedMode.success)) {
      const pricingIssues = parsedPricing.success ? [] : parsedPricing.error.issues;
      const previewIssues = parsedPreviewOverrides.success ? [] : parsedPreviewOverrides.error.issues;
      const modeIssues = parsedMode.success ? [] : parsedMode.error.issues;
      setErrors((current) => ({ ...current, ...Object.fromEntries([...pricingIssues, ...previewIssues, ...modeIssues].map((issue) => [String(issue.path[0]), issue.message])) }));
      return;
    }
    if (stock.lowStockThreshold != null && (!Number.isInteger(stock.lowStockThreshold) || stock.lowStockThreshold < 0)) {
      setErrors((current) => ({ ...current, lowStockThreshold: 'Low-stock threshold must be a non-negative whole number' }));
      return;
    }
    // Only the pricing endpoint still asks for a justification and a password.
    // Product identity and stock settings are audited with a server-generated
    // reason and need neither.
    if (product && pricingChanged) {
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
        const requestedStockSettings = isAdmin || stock.trackStock || stock.lowStockThreshold !== null ? stock : undefined;
        const created = await create.mutateAsync(toCreateInput(values, isAdmin ? pricingInput : undefined, specifications, specificationNotes, labelBarcodeSource, requestedStockSettings));
        if (imageFile) await uploadImage.mutateAsync({ id: created.id, file: imageFile });
        if (created.trackStock) {
          toast.success((notification) => <CreatedTrackedProductToast onVerify={() => {
            toast.dismiss(notification.id);
            setOpeningCountProduct({ id: created.id, name: created.name });
          }} />, { duration: 12_000 });
        } else {
          toast.success('Product created / تم إنشاء المنتج');
        }
        onClose();
      } catch (error) { handleError(error); }
      return;
    }

    const input = changedInput(product, values, specifications, specificationNotes, labelBarcodeSource);
    if (Object.keys(input).length === 0 && !pricingChanged && !stockChanged && !imageFile && !savedImageRemoved) {
      setNotice('No product changes were entered / لم يتم إدخال أي تعديل');
      return;
    }
    try {
      if (Object.keys(input).length > 0) await updateProduct.mutateAsync({ id: product.id, input });
      if (isAdmin && pricingChanged) await updatePricing.mutateAsync({ id: product.id, input: { ...pricingInput, reason: reason.trim(), accountPassword } });
      if (stockChanged) await updateStock.mutateAsync({ id: product.id, input: {
        trackStock: stock.trackStock,
        lowStockThreshold: stock.lowStockThreshold,
      } });
      if (imageFile) await uploadImage.mutateAsync({ id: product.id, file: imageFile });
      else if (shouldRemoveStagedProductImage(product, savedImageRemoved)) await removeImage.mutateAsync(product.id);
      toast.success('Product updated / تم تعديل المنتج');
      onClose();
    } catch (error) { handleError(error); }
  };

  const handleError = (error: unknown) => {
    const normalizedError = normalizeProductError(error);
    const hiddenMessage = firstUnrenderedProductFieldError(normalizedError.fieldErrors, renderedProductFields(isAdmin, pricing, pricingChanged));
    setServerError(hiddenMessage ? `${normalizedError.message} ${hiddenMessage}` : normalizedError.message);
    setErrors((current) => ({ ...current, ...normalizedError.fieldErrors }));
  };

  return <>
    <Modal isOpen={open} onClose={onClose} title={product ? businessLabels.product.editProduct : businessLabels.product.addProduct} maxWidth="max-w-4xl">
      <form onSubmit={submit} className="space-y-5">
        {serverError && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{serverError}</p>}
        {notice && <ProductFormNotice>{notice}</ProductFormNotice>}

        <section className="space-y-4">
          <SectionHeader title="Product identity / هوية المنتج" description="Core catalogue details and notes / بيانات الدليل الأساسية والملاحظات" />
          <div className="grid gap-4 sm:grid-cols-2">
          {product && <div className="sm:col-span-2"><span className="text-xs font-medium text-slate-500">SKU</span><div className="mt-1 inline-flex rounded-md bg-slate-100 px-3 py-2 font-mono text-sm font-bold">{product.sku}</div></div>}
          <ProductTextField label={businessLabels.product.name} value={form.name} onChange={(value) => set('name', value)} error={errors.name} disabled={Boolean(product && !isAdmin)} required />
          <ProductTextField label={businessLabels.product.model} value={form.model} onChange={(value) => set('model', value)} error={errors.model} disabled={Boolean(product && !isAdmin)} required />
          <BrandCombobox label={businessLabels.product.brand} value={form.brand} onChange={(value) => set('brand', value)} error={errors.brand} disabled={Boolean(product && !isAdmin)} />
          <ProductTextField label={businessLabels.product.barcode} value={form.barcode} onChange={(value) => set('barcode', value)} error={errors.barcode} disabled={Boolean(product && !isAdmin)} dir="ltr" userText={false} feedback={<ProductDuplicateInlineError field="Barcode" matches={duplicateMatches} onView={onViewDuplicate} />} />
          <FormField label="Label barcode source / مصدر باركود الملصق" error={errors.labelBarcodeSource} hint={<span dir="auto">{labelPrintPreview(labelBarcodeSource, form.barcode, product?.sku)}</span>}>
            {(field) => <Select {...field} value={labelBarcodeSource} onChange={(event) => setLabelBarcodeSource(event.target.value as LabelBarcodeSource)} disabled={Boolean(product && !isAdmin)}><option value="AUTO">Numeric barcode when available / الباركود الرقمي عند توفره</option><option value="MANUFACTURER">Manufacturer barcode / باركود الشركة</option><option value="SKU">HomeConnect SKU / رمز HomeConnect</option></Select>}
          </FormField>
          <ProductTextField label={businessLabels.product.notes} value={form.notes} onChange={(value) => set('notes', value)} error={errors.notes} textarea className="sm:col-span-2" />
          </div>
        </section>

        <section className="space-y-4"><SectionHeader title="Inventory / المخزون" divided /><ProductStockSection value={stock} onChange={setStock} mode={product ? 'edit' : 'create'} />{errors.lowStockThreshold && <p className="text-xs text-red-600">{errors.lowStockThreshold}</p>}</section>

        <section className="space-y-4"><SectionHeader title="Image / الصورة" divided /><ProductImageField
            product={product}
            url={form.imageUrl}
            onUrlChange={(value) => set('imageUrl', value)}
            file={imageFile}
            onFileChange={setImageFile}
            savedImageRemoved={savedImageRemoved}
            onSavedImageRemovedChange={setSavedImageRemoved}
            error={errors.imageUrl}
          /></section>

        <section className="space-y-4"><SectionHeader title="Specifications / المواصفات" divided /><ProductSpecificationsEditor value={specifications} notes={specificationNotes} onChange={setSpecifications} onNotesChange={setSpecificationNotes} /></section>

        {product && !isAdmin && <p className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">Employees may update product notes. Product identity and pricing require an administrator / يمكن للموظف تعديل الملاحظات فقط.</p>}

        {isAdmin && <section className="space-y-4"><SectionHeader title="Pricing / التسعير" divided /><ProductFormPricingPanel value={pricing} onChange={setPricing} manualPrice={form.price} manualDiscount={form.discount} onManualPriceChange={(value) => set('price', value)} onManualDiscountChange={(value) => set('discount', value)} errors={errors} /></section>}

        {product && pricingChanged && <div className="grid gap-4 rounded-lg border border-amber-200 bg-amber-50 p-4 sm:grid-cols-2">
          <p className="text-xs text-amber-800 sm:col-span-2">Pricing changes need a reason and your account password / تتطلب تعديلات التسعير سببًا وكلمة مرور حسابك</p>
          <ProductTextField label={productLabels.reason} value={reason} onChange={setReason} error={errors.reason} textarea required />
          <ProductTextField label={productLabels.accountPassword} value={accountPassword} onChange={setAccountPassword} error={errors.accountPassword} type="password" userText={false} required />
        </div>}

        {!duplicateDismissed && duplicateMatches.length > 0 && <ProductDuplicateWarning matches={duplicateMatches} onContinue={() => setDuplicateDismissed(true)} onView={onViewDuplicate} />}

        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-4">
          <Button variant="secondary" onClick={onClose}>{businessLabels.common.cancel}</Button>
          <Button type="submit" isLoading={pending} disabled={isProductSaveDisabled(pending, duplicateMatches)}>{product ? businessLabels.common.saveChanges : 'Add Product / إضافة منتج'}</Button>
        </div>
      </form>
    </Modal>
    <VerifyOpeningCountDialog
      productId={openingCountProduct?.id ?? ''}
      productName={openingCountProduct?.name ?? ''}
      open={Boolean(openingCountProduct)}
      onClose={() => setOpeningCountProduct(null)}
    />
  </>;
};

export const CreatedTrackedProductToast: React.FC<{ onVerify: () => void }> = ({ onVerify }) => <div className="flex flex-wrap items-center gap-3">
  <span>Product created. Verify the opening count to enable stock actions. / تم إنشاء المنتج. أكّد الجرد الافتتاحي لتفعيل حركات المخزون.</span>
  <button type="button" onClick={onVerify} className="rounded-lg bg-brand-700 px-3 py-2 text-xs font-semibold text-white">Verify opening count now / تأكيد الجرد الافتتاحي الآن</button>
</div>;

export const ProductFormNotice: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p role="status" className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">{children}</p>
);

interface ProductTextFieldProps {
  label: string; value: string; onChange: (value: string) => void; error?: string;
  disabled?: boolean; textarea?: boolean; type?: string; inputMode?: 'text' | 'decimal'; dir?: 'auto' | 'ltr';
  className?: string; feedback?: React.ReactNode; required?: boolean; userText?: boolean;
}

const ProductTextField: React.FC<ProductTextFieldProps> = ({
  label, value, onChange, error, disabled, textarea, type = 'text', inputMode = 'text', dir = 'auto',
  className, feedback, required = false, userText = true,
}) => (
  <div className={className}>
    <FormField label={label} error={error} required={required}>
      {(field) => textarea
        ? <Textarea {...field} value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled} dir={dir} userText={userText} className="min-h-24" />
        : <Input {...field} value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled} type={type} inputMode={inputMode} dir={dir} userText={userText} />}
    </FormField>
    {feedback}
  </div>
);

export function productDuplicateQueryForForm(values: ProductFormValues, product?: Product | null): ProductDuplicateQuery {
  const barcode = values.barcode.trim();
  return {
    name: values.name.trim() || undefined,
    model: values.model.trim() || undefined,
    brand: values.brand.trim() || undefined,
    barcode: !product || barcode !== (product.barcode ?? '') ? barcode || undefined : undefined,
    excludeProductId: product?.id,
  };
}

export const hasBlockingProductDuplicate = (matches: ProductDuplicateMatch[]) =>
  matches.some((match) => match.reason === 'BARCODE_TAKEN' || match.reason === 'SKU_TAKEN');

export const isProductSaveDisabled = (pending: boolean, matches: ProductDuplicateMatch[]) =>
  pending || hasBlockingProductDuplicate(matches);

function normalized(value: unknown): string {
  return value == null ? '' : String(value).trim();
}

export function toCreateInput(values: ProductFormValues, pricing?: ProductPricingConfigurationInput, specifications: ProductSpecification[] = [], specificationNotes = '', labelBarcodeSource: LabelBarcodeSource = 'AUTO', stock?: ProductStockInput) {
  return {
    name: values.name.trim(), model: values.model.trim(), brand: values.brand.trim() || null,
    barcode: values.barcode.trim() || null, price: values.price.trim() || null,
    discount: values.discount.trim() || null, imageUrl: values.imageUrl.trim() || null,
    notes: values.notes.trim() || null,
    labelBarcodeSource,
    specifications: cleanSpecifications(specifications), specificationNotes: specificationNotes.trim() || null,
    ...(stock ? {
      trackStock: stock.trackStock,
      lowStockThreshold: stock.trackStock ? stock.lowStockThreshold : null,
    } : {}),
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
    mode: product.pricing?.mode ?? 'NONE',
    costPrice: config?.costPrice ?? product.pricing?.costPrice ?? '',
    pricingPresetId: config?.pricingPresetId ?? product.pricing?.pricingPresetId ?? '',
    useCustomPricing: config?.useCustomPricing ?? product.pricing?.useCustomPricing ?? false,
    installmentEnabled: config?.installmentEnabled ?? product.pricing?.installmentEnabled ?? false,
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

export function buildProductPricingConfigurationInput(values: ProductFormPricingValues): ProductPricingConfigurationInput {
  if (values.mode === 'NONE' || values.mode === 'MANUAL' || !values.costPrice.trim()) {
    return {
      costPrice: null,
      pricingPresetId: null,
      useCustomPricing: false,
      installmentEnabled: false,
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
    useCustomPricing: values.mode === 'CUSTOM',
    installmentEnabled: values.installmentEnabled,
    customExpensePercent: null,
    customProfitPercent: null,
    customDiscountBufferPercent: null,
    customInstallmentMarkupPercent: null,
    customDownPaymentPercent: null,
    customInstallmentMonths: null,
    customCalculationMode: null,
  };
  if (values.mode !== 'CUSTOM') return input;
  return {
    ...input,
    customExpensePercent: values.customExpensePercent,
    customProfitPercent: values.customProfitPercent,
    customDiscountBufferPercent: values.customDiscountBufferPercent,
    customInstallmentMarkupPercent: values.installmentEnabled ? values.previewInstallmentMarkupPercent : null,
    customDownPaymentPercent: values.installmentEnabled ? values.previewDownPaymentPercent : null,
    customInstallmentMonths: values.installmentEnabled && /^\d+$/.test(values.previewInstallmentMonths) ? Number(values.previewInstallmentMonths) : null,
    customCalculationMode: values.customCalculationMode,
  };
}

export function renderedProductFields(
  isAdmin: boolean,
  pricing: ProductFormPricingValues,
  pricingCorrectionVisible = false
): Set<string> {
  const fields = new Set(['name', 'model', 'brand', 'barcode', 'imageUrl', 'notes', 'labelBarcodeSource']);
  if (!isAdmin) return fields;
  fields.add('price');
  fields.add('discount');
  if (pricingCorrectionVisible) {
    fields.add('reason');
    fields.add('accountPassword');
  }
  if (pricing.mode === 'PRESET' || pricing.mode === 'CUSTOM') {
    fields.add('costPrice');
    fields.add('pricingPresetId');
  }
  if (pricing.mode === 'CUSTOM') {
    fields.add('customExpensePercent');
    fields.add('customProfitPercent');
    fields.add('customDiscountBufferPercent');
    fields.add('customCalculationMode');
  }
  if (pricing.installmentEnabled) {
    for (const field of ['previewInstallmentMonths', 'previewDownPaymentPercent', 'previewInstallmentMarkupPercent', 'customInstallmentMonths', 'customDownPaymentPercent', 'customInstallmentMarkupPercent']) fields.add(field);
  }
  return fields;
}

function labelPrintPreview(source: LabelBarcodeSource, barcode: string, sku?: string): string {
  const savedBarcode = barcode.trim();
  if ((source === 'AUTO' || source === 'MANUFACTURER') && savedBarcode) return `Will print: ${savedBarcode} / ستتم الطباعة: ${savedBarcode}`;
  // A new product without a barcode gets a shop-internal EAN-13 (200…) when it is saved.
  if (source === 'AUTO' && !savedBarcode && !sku) return 'Will print: a new shop barcode (200…), generated on save / سيتم إنشاء باركود داخلي عند الحفظ';
  if (source === 'AUTO' && !savedBarcode) return `Will print: ${sku ?? 'SKU'} — no barcode saved / ستتم طباعة رمز المنتج — لا يوجد باركود محفوظ`;
  if (source === 'MANUFACTURER') return 'Manufacturer barcode required / باركود الشركة مطلوب';
  return `Will print: ${sku ?? 'SKU'} / ستتم الطباعة: ${sku ?? 'SKU'}`;
}

function isProductPricingChanged(product: Product, next: ProductPricingConfigurationInput): boolean {
  const current = product.pricing?.configuration;
  const comparableCurrent: ProductPricingConfigurationInput = {
    costPrice: current?.costPrice ?? product.pricing?.costPrice ?? null,
    pricingPresetId: current?.pricingPresetId ?? product.pricing?.pricingPresetId ?? null,
    useCustomPricing: current?.useCustomPricing ?? product.pricing?.useCustomPricing ?? false,
    installmentEnabled: current?.installmentEnabled ?? product.pricing?.installmentEnabled ?? false,
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

export function shouldUpdateProductPricing(
  isAdmin: boolean,
  product: Product | null | undefined,
  next: ProductPricingConfigurationInput
): boolean {
  return Boolean(isAdmin && product && isProductPricingChanged(product, next));
}

export function shouldRemoveStagedProductImage(product: Product | null | undefined, removalStaged: boolean): boolean {
  return Boolean(removalStaged && product?.image?.source === 'UPLOAD');
}
