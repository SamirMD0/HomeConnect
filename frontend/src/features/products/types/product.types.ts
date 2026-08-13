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
  createdAt: string;
  updatedAt: string;
  createdById?: string;
  updatedById?: string | null;
  createdBy?: ProductActor;
  updatedBy?: ProductActor | null;
  pricing?: ({pricingAvailable:true;mode:ProductPricingMode;source:PricingSource;pricingPresetId:string|null;presetName:string|null;useCustomPricing:boolean;installmentEnabled:boolean;cashPrice:string;installmentPrice?:string;downPayment?:string;remaining?:string;monthlyPayment?:string;lastInstallmentPayment?:string;installmentMonths?:number;costPrice?:string;configuration?:ProductPricingFields;warnings:string[]} | ({pricingAvailable:false;mode:ProductPricingMode;reason:string;pricingPresetId:string|null;presetName:string|null;useCustomPricing:boolean;installmentEnabled:boolean;costPrice?:string|null;configuration?:ProductPricingFields}));
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
export interface UpdateProductStockInput extends ProductActionInput {
  trackStock: boolean;
  lowStockThreshold: number | null;
}
export interface UpdateProductSkuInput extends ProductActionInput { sku: string }

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

export interface ProductFilters {
  search?: string;
  isActive?: boolean;
  brand?: string;
  hasBarcode?: boolean;
  sortBy?: ProductSortBy;
  sortOrder?: ProductSortOrder;
  page?: number;
  pageSize?: number;
}

export type ProductSortBy = 'name' | 'model' | 'brand' | 'price' | 'createdAt' | 'updatedAt';
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
}

export type UpdateProductInput = Partial<CreateProductInput> & {
  reason?: string;
  accountPassword?: string;
};

export interface ProductActionInput {
  reason: string;
  accountPassword: string;
}

export interface ProductDuplicateQuery {
  name: string;
  model: string;
  brand?: string | null;
}

export interface ProductDuplicateMatch {
  id: string;
  name: string;
  model: string;
  brand: string | null;
  isActive: boolean;
}

export interface ProductServiceJobsResult {
  items: ServiceJob[];
  pagination: ProductPaginationMeta;
}

export interface ProductPricingFields { costPrice?:string|null;pricingPresetId?:string|null;useCustomPricing:boolean;installmentEnabled:boolean;customExpensePercent?:string|null;customProfitPercent?:string|null;customDiscountBufferPercent?:string|null;customInstallmentMarkupPercent?:string|null;customDownPaymentPercent?:string|null;customInstallmentMonths?:number|null;customCalculationMode?:PricingCalculationMode|null }
export type UpdateProductPricingInput=ProductPricingInput;
export type ProductPricingPreview=PricingPreview;
