import type { ServiceJob } from '../../service/types/service.types';
import type { PricingCalculationMode, PricingPreview, PricingSource, ProductPricingConfigurationInput, ProductPricingInput } from '../../pricing/types/pricing.types';

export interface ProductActor {
  fullName: string;
  username: string;
}

/** An external link, or bytes stored on the server and fetched from the image endpoint. */
export type ProductImage =
  | { source: 'URL'; url: string }
  | { source: 'UPLOAD'; mimeType: string; byteSize: number; updatedAt: string };

export interface Product {
  id: string;
  sku: string;
  name: string;
  model: string;
  barcode: string | null;
  brand: string | null;
  price: string | null;
  discount: string | null;
  netPrice: string | null;
  priceCurrency?: 'USD' | 'LBP';
  taxProfileId?: string | null;
  priceIncludesVat?: boolean;
  isActive: boolean;
  imageUrl: string | null;
  image: ProductImage | null;
  notes: string | null;
  labelBarcodeSource: LabelBarcodeSource;
  trackStock: boolean;
  stockQuantity: number;
  lowStockThreshold: number | null;
  stockStatus: ProductStockStatus;
  specifications: ProductSpecification[];
  specificationNotes: string | null;
  exactMatch?: boolean;
  /**
   * List-only. True when the product has never had a stock movement and was
   * never switched on for tracking — it exists in the catalogue but has not
   * been brought into inventory. Absent on the single-product read, where the
   * inventory panel reports the fuller onboarding status instead.
   */
  notInInventory?: boolean;
  createdAt: string;
  updatedAt: string;
  createdById?: string;
  updatedById?: string | null;
  createdBy?: ProductActor;
  updatedBy?: ProductActor | null;
  pricing?: ({pricingAvailable:true;mode:ProductPricingMode;source:PricingSource;pricingPresetId:string|null;presetName:string|null;useCustomPricing:boolean;installmentEnabled:boolean;cashPrice:string;cashPriceExVat?:string;vatAmount?:string;cashPriceIncVat?:string;taxRatePercent?:string;taxCode?:string;installmentPrice?:string;downPayment?:string;remaining?:string;monthlyPayment?:string;lastInstallmentPayment?:string;installmentMonths?:number;costPrice?:string;configuration?:ProductPricingFields;warnings:string[]} | ({pricingAvailable:false;mode:ProductPricingMode;reason:string;pricingPresetId:string|null;presetName:string|null;useCustomPricing:boolean;installmentEnabled:boolean;costPrice?:string|null;configuration?:ProductPricingFields}));
}

export interface ProductLabelData {
  id: string;
  name: string;
  model: string;
  brand: string | null;
  sku: string;
  barcodeValue: string;
  barcodeSource: Exclude<LabelBarcodeSource, 'AUTO'>;
  internalPriceCode?: string | null;
  staffLabelCode?: string | null;
  cashPrice?: string | null;
  cashPriceExVat?: string | null;
  cashPriceIncVat?: string | null;
  vatAmount?: string | null;
  taxRatePercent?: string | null;
  taxCode?: string | null;
}

export type ProductLabelWarningCode =
  | 'NOT_FOUND'
  | 'ARCHIVED_EXCLUDED'
  | 'NO_PRICING'
  | 'MANUFACTURER_BARCODE_MISSING'
  | 'FALLBACK_TO_SKU';

export interface ProductLabelWarning {
  productId: string;
  code: ProductLabelWarningCode;
  name?: string;
}

export interface ProductLabelsResult {
  labels: ProductLabelData[];
  warnings: ProductLabelWarning[];
}

export interface ProductLabelResult {
  payload: ProductLabelData;
  warnings: ProductLabelWarning[];
}

export type LabelBarcodeSource = 'AUTO' | 'SKU' | 'MANUFACTURER';
export type ProductPricingMode = 'PRESET' | 'CUSTOM' | 'MANUAL' | 'NONE';
export type ProductStockStatus = 'NOT_TRACKED' | 'OUT_OF_STOCK' | 'LOW_STOCK' | 'IN_STOCK';
export interface ProductSpecification { label: string; value: string }
export interface ProductStockInput {
  trackStock: boolean; stockQuantity: number; lowStockThreshold: number | null;
}
// Stock settings and SKU are admin-role work as of v1.8.1: no reason, no password.
export interface UpdateProductStockInput {
  trackStock: boolean;
  lowStockThreshold: number | null;
}
export interface UpdateProductSkuInput { sku: string }

export interface ProductAudit {
  id: string;
  action: string;
  changedByName: string;
  changedByUsername: string;
  changedAt: string;
  reason: string;
  beforeValues: Record<string, unknown>;
  afterValues: Record<string, unknown>;
}

export interface ProductPaginationMeta {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface ProductBrandSummary {
  canonical: string;
  productCount: number;
  spellings: string[];
  spellingCounts: Array<{ spelling: string; productCount: number }>;
}

export interface ProductBrandNormalizeInput {
  sourceBrands: string[];
  targetBrand: string;
  reason: string;
  dryRun?: boolean;
}

export interface ProductBrandNormalizeProduct {
  id: string;
  sku: string;
  name: string;
  brand: string | null;
}

export interface ProductBrandNormalizeDryRunResult {
  targetBrand: string;
  affectedCount: number;
  products: ProductBrandNormalizeProduct[];
  warnings: string[];
}

export interface ProductBrandNormalizeWriteResult {
  targetBrand: string;
  updatedCount: number;
  products: ProductBrandNormalizeProduct[];
}

export type ProductBrandNormalizeResult = ProductBrandNormalizeDryRunResult | ProductBrandNormalizeWriteResult;

export interface ProductFilters {
  search?: string;
  isActive?: boolean;
  brand?: string;
  hasBarcode?: boolean;
  trackStock?: boolean;
  stockStatus?: ProductStockFilter;
  sortBy?: ProductSortBy;
  sortOrder?: ProductSortOrder;
  page?: number;
  pageSize?: number;
}

/**
 * The first four mirror `ProductStockStatus`, so filtering by one returns
 * exactly the rows whose badge shows it. `NOT_IN_INVENTORY` is the extra case:
 * never brought into inventory at all.
 */
export type ProductStockFilter = ProductStockStatus | 'NOT_IN_INVENTORY';

/**
 * What the toolbar can change, keyed by URL parameter name.
 *
 * `isActive` is excluded on purpose: it is stored as the `status` tab, so a
 * patch containing it would write a second parameter the page never reads.
 * Keeping it out of the type makes that a compile error rather than a filter
 * that silently does nothing.
 */
export type ProductFilterPatch = Partial<Omit<ProductFilters, 'isActive'>>;

export type ProductSortBy = 'name' | 'model' | 'brand' | 'price' | 'stock' | 'createdAt' | 'updatedAt';
export type ProductSortOrder = 'asc' | 'desc';

export interface CreateProductInput extends ProductPricingConfigurationInput {
  name: string;
  model: string;
  barcode?: string | null;
  brand?: string | null;
  price?: string | null;
  discount?: string | null;
  imageUrl?: string | null;
  notes?: string | null;
  labelBarcodeSource?: LabelBarcodeSource;
  specifications?: ProductSpecification[];
  specificationNotes?: string | null;
  trackStock?: boolean;
  lowStockThreshold?: number | null;
}

/**
 * The relaxed product-edit endpoint. Pricing fields are deliberately absent —
 * they belong to the strict pricing endpoint, and the backend schema is `.strict()`
 * so sending one here is a 400 rather than a silent no-op.
 */
export type UpdateProductInput = Partial<Omit<
  CreateProductInput,
  keyof ProductPricingConfigurationInput | 'trackStock' | 'lowStockThreshold'
>>;

/** Archive and restore stay strict: typed reason plus admin password. */
export interface ProductActionInput {
  reason: string;
  accountPassword: string;
}

export interface ProductDuplicateQuery {
  name?: string;
  model?: string;
  brand?: string | null;
  barcode?: string | null;
  sku?: string | null;
  excludeProductId?: string;
}

export type ProductDuplicateReason = 'BARCODE_TAKEN' | 'SKU_TAKEN' | 'SAME_NAME_MODEL' | 'SAME_MODEL_BRAND';

export interface ProductDuplicateMatch {
  id: string;
  name: string;
  model: string;
  brand: string | null;
  sku: string;
  barcode: string | null;
  isActive: boolean;
  reason: ProductDuplicateReason;
}

export interface ProductServiceJobsResult {
  items: ServiceJob[];
  pagination: ProductPaginationMeta;
}

export interface ProductPricingFields { costPrice?:string|null;priceCurrency?:'USD'|'LBP';pricingPresetId?:string|null;useCustomPricing:boolean;installmentEnabled:boolean;customExpensePercent?:string|null;customProfitPercent?:string|null;customDiscountBufferPercent?:string|null;customInstallmentMarkupPercent?:string|null;customDownPaymentPercent?:string|null;customInstallmentMonths?:number|null;customCalculationMode?:PricingCalculationMode|null;taxProfileId?:string|null;priceIncludesVat?:boolean }
export type UpdateProductPricingInput=ProductPricingInput;
export type ProductPricingPreview=PricingPreview;
