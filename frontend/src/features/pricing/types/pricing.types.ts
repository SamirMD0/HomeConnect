export type PricingCalculationMode = 'COMPOUND' | 'SIMPLE';
export type PricingRoundingMode = 'NONE' | 'NEAREST_0_50' | 'NEAREST_1' | 'CEIL_1';
export type PricingSource = 'PRESET' | 'CUSTOM' | 'DEFAULT_PRESET';
export type PricingUnavailableReason = 'MISSING_COST_PRICE' | 'MISSING_PRESET' | 'NO_DEFAULT_PRESET' | 'INCOMPLETE_CUSTOM_PRICING';

export interface PricingPreset {
  id: string; name: string; productType: string | null;
  expensePercent: string; profitPercent: string; discountBufferPercent: string;
  installmentMarkupPercent: string; downPaymentPercent: string; defaultInstallmentMonths: number;
  calculationMode: PricingCalculationMode; roundingMode: PricingRoundingMode;
  isDefault: boolean; isLabelSecretAllowed: boolean; isActive: boolean; isArchived: boolean; notes: string | null;
  archivedAt: string | null; archivedReason: string | null; createdAt: string; updatedAt: string;
}
export interface PricingPagination { page: number; pageSize: number; totalItems: number; totalPages: number }
export interface PricingPresetFilters { search?: string; productType?: string; isActive?: boolean; sortBy?: 'name'|'productType'|'createdAt'|'updatedAt'; sortOrder?: 'asc'|'desc'; page?: number; pageSize?: number }
export interface PricingFormulaInput {
  expensePercent: string; profitPercent: string; discountBufferPercent: string;
  installmentMarkupPercent: string; downPaymentPercent: string;
  defaultInstallmentMonths: number; calculationMode: PricingCalculationMode; roundingMode: PricingRoundingMode;
}
export interface CreatePricingPresetInput extends PricingFormulaInput { name: string; productType?: string|null; notes?: string|null; reason: string; accountPassword: string }
export type UpdatePricingPresetInput = Partial<Omit<CreatePricingPresetInput,'reason'|'accountPassword'>> & { reason: string; accountPassword?: string };
export interface PricingProtectedAction { reason: string; accountPassword: string }
export interface PricingPasswordAction { accountPassword: string }
export interface PricingAudit { id:string; action:string; changedByName:string; changedByUsername:string; changedAt:string; reason:string; beforeValues:Record<string,unknown>; afterValues:Record<string,unknown> }

export interface PricingCalculationResult {
  cashPrice: string; installmentPrice: string; downPayment: string; remaining: string;
  monthlyPayment: string; lastInstallmentPayment: string; installmentMonths: number;
  expensesAmount: string; profitAmount: string; discountBufferAmount: string;
  priceWithoutDiscountBuffer: string; internalPriceCode: string | null;
}
export interface PricingCalculateInput { costPrice:string; presetId?:string; overrides?:Partial<Omit<PricingFormulaInput,'defaultInstallmentMonths'>>; installmentMonths?:number }
export interface PricingPreviewAvailable {
  pricingAvailable: true; source: PricingSource; preset:{id:string;name:string;isArchived:boolean}|null;
  calculationMode:PricingCalculationMode; roundingMode:PricingRoundingMode;
  inputs:{costPrice?:string;expensePercent:string;profitPercent:string;discountBufferPercent:string;installmentMarkupPercent:string;downPaymentPercent:string;installmentMonths:number};
  breakdown:{expensesAmount:string;profitAmount:string;discountBufferAmount:string}; cashPrice:string;
  priceWithoutDiscountBuffer:string; internalPriceCode:string|null;
  installment:{installmentPrice:string;downPayment:string;remaining:string;monthlyPayment:string;lastInstallmentPayment:string;installmentMonths:number};
  warnings:string[];
}
export interface PricingPreviewUnavailable { pricingAvailable:false; reason:PricingUnavailableReason }
export type PricingPreview = PricingPreviewAvailable | PricingPreviewUnavailable;

export interface ProductPricingConfigurationInput {
  costPrice?:string|null; pricingPresetId?:string|null; useCustomPricing?:boolean; installmentEnabled?:boolean;
  customExpensePercent?:string|null; customProfitPercent?:string|null; customDiscountBufferPercent?:string|null;
  customInstallmentMarkupPercent?:string|null; customDownPaymentPercent?:string|null;
  customInstallmentMonths?:number|null; customCalculationMode?:PricingCalculationMode|null;
}
export interface ProductPricingInput extends ProductPricingConfigurationInput {
  reason:string; accountPassword:string;
}

/** Protected actions on a preset. `labelSecret` chooses the preset behind the hidden staff code on labels. */
export type PricingPresetAction = 'archive' | 'restore' | 'default' | 'labelSecret' | 'clearLabelSecret';

export type LabelSecretEncodingMode = 'STAGED_DISCOUNT' | 'PRICE' | 'DISCOUNT_PERCENTAGE' | 'OFFSET_PRICE' | 'DIGIT_MAP_PRICE';
export interface LabelSecretEncodingPreset {
  id:string; name:string; mode:LabelSecretEncodingMode; prefix:string; suffix:string;
  offset:string; digitMap:string|null; decimalPlaces:number; isActive:boolean;
}
export interface LabelSecretConfiguration {
  settings:{id:string;defaultPricingPresetId:string|null;defaultEncodingPresetId:string|null;showCodeOnLabel:boolean}|null;
  availablePricingPresets:Array<{id:string;name:string}>;
  allowedPricingPresets:Array<{id:string;name:string}>;
  encodingPresets:LabelSecretEncodingPreset[];
}
export interface UpdateLabelSecretSettingsInput {
  allowedPricingPresetIds:string[]; defaultPricingPresetId:string|null; defaultEncodingPresetId:string|null;
  showCodeOnLabel:boolean; accountPassword:string;
}
export interface LabelSecretEncodingInput extends Omit<LabelSecretEncodingPreset,'id'> { accountPassword:string }
