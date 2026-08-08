import { LabelBarcodeSource, PricingCalculationMode } from '@prisma/client';
import { z } from 'zod';
import { compareMoney } from '../../financial/domain/money';
import { isDecimalAtMost } from '../../../validators/decimal-bounds';
import { userTextSchema } from '../../../validators/user-text';
import { containsSensitiveProductFields } from '../authorization/service-policy';
import { MAX_PRODUCT_SPECIFICATIONS, MAX_PRODUCT_SPECIFICATIONS_BYTES, normalizeProductSpecifications, serializedSpecificationsSize } from './product-specifications';
import { PRODUCT_SKU_PATTERN } from './product-sku';

const uuidSchema = z.string().uuid('Invalid product ID');
const moneyPattern = /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/;
const emptyToNull = (value: unknown) => typeof value === 'string' && value.trim() === '' ? null : value;
const optionalMoneySchema = z.preprocess(
  emptyToNull,
  z.string().trim().regex(moneyPattern, 'Money must be a non-negative decimal string with up to 2 decimal places').optional().nullable()
);
const barcodeSchema = z.preprocess(
  emptyToNull,
  z.string().trim().min(4, 'Barcode must be at least 4 characters').max(64, 'Barcode is too long')
    .regex(/^[A-Za-z0-9-]+$/, 'Barcode may contain only letters, numbers, and hyphens').optional().nullable()
);
const imageUrlSchema = z.preprocess(
  emptyToNull,
  z.string().trim().max(2048, 'Image URL is too long')
    .refine((value) => {
      try {
        const { protocol } = new URL(value);
        return protocol === 'http:' || protocol === 'https:';
      } catch {
        return false;
      }
    }, 'Image URL must be a valid http:// or https:// address')
    .optional().nullable()
);
const optionalUserText = (field: string, max: number) => z.preprocess(
  emptyToNull,
  userTextSchema({ field, max }).optional().nullable()
);

const percentPattern = /^(?:0|[1-9]\d*)(?:\.\d{1,3})?$/;
const pricingPercent = (maximum = '999.999') => z.preprocess(
  emptyToNull,
  z.string().trim().regex(percentPattern, 'Use a non-negative percentage with up to 3 decimal places')
    .refine((value) => isDecimalAtMost(value, maximum), `Percentage cannot exceed ${maximum}`).optional().nullable()
);
const positiveCost = z.preprocess(
  emptyToNull,
  z.string().trim().regex(moneyPattern, 'Cost must have up to 2 decimal places')
    // parseMoney throws on malformed input, and a throw escapes safeParse — so the
    // comparison is guarded and a bad value falls through to the regex message.
    .refine((value) => { try { return compareMoney(value, '0.00') > 0; } catch { return false; } },
      'Cost price must be greater than zero').optional().nullable()
);
const productPricingValues = {
  costPrice: positiveCost,
  pricingPresetId: z.preprocess(emptyToNull, z.string().uuid().optional().nullable()),
  useCustomPricing: z.boolean().optional(),
  installmentEnabled: z.boolean().optional(),
  customExpensePercent: pricingPercent(),
  customProfitPercent: pricingPercent(),
  customDiscountBufferPercent: pricingPercent(),
  customInstallmentMarkupPercent: pricingPercent(),
  customDownPaymentPercent: pricingPercent('100'),
  customInstallmentMonths: z.preprocess(emptyToNull, z.coerce.number().int().min(1).max(120).optional().nullable()),
  customCalculationMode: z.preprocess(emptyToNull, z.nativeEnum(PricingCalculationMode).optional().nullable()),
};

const PRICING_VALUE_FIELDS = [
  'costPrice', 'pricingPresetId', 'customExpensePercent', 'customProfitPercent',
  'customDiscountBufferPercent', 'customInstallmentMarkupPercent',
  'customDownPaymentPercent', 'customInstallmentMonths', 'customCalculationMode',
] as const;

const productValues = {
  name: userTextSchema({ field: 'Product name', min: 1, max: 200 }),
  model: userTextSchema({ field: 'Model', min: 1, max: 120 }),
  barcode: barcodeSchema,
  brand: optionalUserText('Brand', 120),
  price: optionalMoneySchema,
  discount: optionalMoneySchema,
  imageUrl: imageUrlSchema,
  notes: optionalUserText('Notes', 2000),
  labelBarcodeSource: z.nativeEnum(LabelBarcodeSource).optional(),
  specifications: z.array(z.object({
    label: userTextSchema({ field: 'Specification label', max: 64 }),
    value: userTextSchema({ field: 'Specification value', max: 256 }),
  })).max(MAX_PRODUCT_SPECIFICATIONS).transform(normalizeProductSpecifications)
    .refine((entries) => serializedSpecificationsSize(entries) <= MAX_PRODUCT_SPECIFICATIONS_BYTES, 'Specifications cannot exceed 8 KB').optional(),
  specificationNotes: optionalUserText('Specification notes', 4000),
};

export const productSkuSchema = z.string().trim().toUpperCase().min(4).max(32)
  .regex(PRODUCT_SKU_PATTERN, 'SKU may contain only uppercase letters, numbers, and hyphens');

function validateDiscount(
  values: { price?: string | null; discount?: string | null },
  context: z.RefinementCtx
) {
  if (
    values.price != null && values.discount != null &&
    moneyPattern.test(values.price) && moneyPattern.test(values.discount) &&
    compareMoney(values.discount, values.price) > 0
  ) {
    context.addIssue({ code: 'custom', path: ['discount'], message: 'Discount cannot exceed price' });
  }
}

export const createProductSchema = z.object({ ...productValues, ...productPricingValues }).strict().superRefine((values, context) => {
  validateDiscount(values, context);
  validateCustomPricing(values, context);
  validateLabelBarcodeSource(values, context);
});

export const updateProductSchema = z
  .object({
    name: productValues.name.optional(),
    model: productValues.model.optional(),
    barcode: productValues.barcode,
    brand: productValues.brand,
    price: productValues.price,
    discount: productValues.discount,
    imageUrl: productValues.imageUrl,
    notes: productValues.notes,
    labelBarcodeSource: productValues.labelBarcodeSource,
    specifications: productValues.specifications,
    specificationNotes: productValues.specificationNotes,
    reason: userTextSchema({ field: 'Reason', min: 5, max: 1000 }).optional(),
    accountPassword: z.string().min(1, 'Account password is required').optional(),
  })
  .superRefine((values, context) => {
    validateDiscount(values, context);
    const fields = Object.keys(values).filter(
      (field) => !['reason', 'accountPassword'].includes(field) && values[field as keyof typeof values] !== undefined
    );
    if (!containsSensitiveProductFields(fields)) return;
    if (!values.reason) context.addIssue({ code: 'custom', path: ['reason'], message: 'Reason is required for sensitive product changes' });
    if (!values.accountPassword) context.addIssue({ code: 'custom', path: ['accountPassword'], message: 'Account password is required' });
  });

export const productActionSchema = z.object({
  reason: userTextSchema({ field: 'Reason', min: 5, max: 1000 }),
  accountPassword: z.string().min(1, 'Account password is required'),
});

export const updateProductSkuSchema = productActionSchema.extend({ sku: productSkuSchema });
export const updateProductStockSchema = productActionSchema.extend({
  trackStock: z.boolean(),
  stockQuantity: z.number().int('Stock quantity must be an integer').min(0),
  lowStockThreshold: z.number().int('Low stock threshold must be an integer').min(0).nullable(),
});

export const productParamsSchema = z.object({ productId: uuidSchema });

export const productListQuerySchema = z.object({
  search: z.string().trim().max(200).optional(),
  isActive: z.enum(['true', 'false']).optional().transform((value) => value === undefined ? undefined : value === 'true'),
  brand: z.string().trim().max(120).optional(),
  hasBarcode: z.enum(['true', 'false']).optional().transform((value) => value === undefined ? undefined : value === 'true'),
  sortBy: z.enum(['name', 'model', 'brand', 'price', 'createdAt', 'updatedAt']).default('name'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(25),
});

/**
 * Deliberately permissive: it only asserts that a code was sent and that it is
 * not large enough to be an attack. Whether the code is usable is decided by
 * `normalizeScanCode`, so a junk scan comes back as a 200 with status
 * `INVALID_CODE` — a state the scanner UI can show — instead of a 400 the
 * scanning workflow would have to translate.
 */
export const productScanQuerySchema = z.object({
  code: z.string().min(1, 'Scan code is required').max(1024, 'Scan code is too long'),
});

export const productDuplicateQuerySchema = z.object({
  name: userTextSchema({ field: 'Product name', min: 1, max: 200 }),
  model: userTextSchema({ field: 'Model', min: 1, max: 120 }),
  brand: z.preprocess(emptyToNull, userTextSchema({ field: 'Brand', max: 120 }).optional().nullable()),
});

export const productServiceJobsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(10),
});

export const productAuditQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(50),
});

export const updateProductPricingSchema = z.object({
  ...productPricingValues,
  reason: userTextSchema({ field: 'Reason', min: 5, max: 1000 }),
  accountPassword: z.string().min(1, 'Account password is required'),
}).strict().superRefine((values, context) => {
  const fields = Object.keys(values).filter((field) => !['reason', 'accountPassword'].includes(field));
  if (fields.length === 0) context.addIssue({ code: 'custom', message: 'At least one pricing field is required' });
  validateCustomPricing(values, context);
});

function validateCustomPricing(values: Record<string, unknown>, context: z.RefinementCtx) {
  const hasPricingConfiguration = PRICING_VALUE_FIELDS.some((field) => values[field] != null)
    || values.useCustomPricing === true
    || values.installmentEnabled === true;
  if (hasPricingConfiguration && values.costPrice == null) {
    context.addIssue({ code: 'custom', path: ['costPrice'], message: 'Cost price is required for product pricing' });
  }
  if (values.useCustomPricing !== true) return;
  const fields = ['customExpensePercent','customProfitPercent','customDiscountBufferPercent','customCalculationMode',
    ...(values.installmentEnabled === true ? ['customInstallmentMarkupPercent','customDownPaymentPercent','customInstallmentMonths'] as const : [])];
  for (const field of fields) {
    if (values[field] == null) context.addIssue({ code: 'custom', path: [field], message: 'Required when custom pricing is enabled' });
  }
}

function validateLabelBarcodeSource(
  values: { labelBarcodeSource?: LabelBarcodeSource; barcode?: string | null },
  context: z.RefinementCtx
) {
  if (values.labelBarcodeSource === LabelBarcodeSource.MANUFACTURER && !values.barcode) {
    context.addIssue({
      code: 'custom',
      path: ['barcode'],
      message: 'A manufacturer barcode is required when it is selected for the label',
    });
  }
}

export const productPricingPreviewQuerySchema = z.object({ installmentMonths: z.coerce.number().int().min(1).max(120).optional() });
export const productLabelQuerySchema = z.object({
  includePriceCode: z.enum(['true', 'false']).optional().transform((value) => value === 'true'),
  includePrice: z.enum(['true', 'false']).optional().transform((value) => value === 'true'),
});

/**
 * One print run is capped so a stray "select everything" cannot turn into a
 * thousand-label query string. The frontend caps first and says so; this is the
 * backstop.
 */
export const MAX_LABEL_SELECTION = 100;

export const productLabelsQuerySchema = z.object({
  ids: z.string()
    .transform((csv) => [...new Set(csv.split(',').map((value) => value.trim()).filter(Boolean))])
    .pipe(
      z.array(uuidSchema)
        .min(1, 'Select at least one product')
        .max(MAX_LABEL_SELECTION, `Select at most ${MAX_LABEL_SELECTION} products`)
    ),
  includePriceCode: z.enum(['true', 'false']).optional().transform((value) => value === 'true'),
  includePrice: z.enum(['true', 'false']).optional().transform((value) => value === 'true'),
  includeArchived: z.enum(['true', 'false']).optional().transform((value) => value === 'true'),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type ProductActionInput = z.infer<typeof productActionSchema>;
export type ProductParamsInput = z.infer<typeof productParamsSchema>;
export type ProductListQueryInput = z.infer<typeof productListQuerySchema>;
export type ProductAuditQueryInput = z.infer<typeof productAuditQuerySchema>;
export type ProductDuplicateQueryInput = z.infer<typeof productDuplicateQuerySchema>;
export type ProductScanQueryInput = z.infer<typeof productScanQuerySchema>;
export type ProductServiceJobsQueryInput = z.infer<typeof productServiceJobsQuerySchema>;
export type UpdateProductPricingInput = z.infer<typeof updateProductPricingSchema>;
export type ProductPricingPreviewQueryInput = z.infer<typeof productPricingPreviewQuerySchema>;
export type UpdateProductSkuInput = z.infer<typeof updateProductSkuSchema>;
export type UpdateProductStockInput = z.infer<typeof updateProductStockSchema>;
export type ProductLabelQueryInput = z.infer<typeof productLabelQuerySchema>;
export type ProductLabelsQueryInput = z.infer<typeof productLabelsQuerySchema>;
