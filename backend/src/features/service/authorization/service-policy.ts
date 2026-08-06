import { Role } from '@prisma/client';
import { AuthorizationError } from '../../../lib/errors';
import { requireRole } from '../../../middleware/role.middleware';

export const requireServiceAdmin = requireRole([Role.ADMIN]);

export const PRODUCT_FIELD_POLICY = {
  name: true,
  model: true,
  barcode: true,
  brand: true,
  price: true,
  discount: true,
  costPrice: true,
  pricingPresetId: true,
  useCustomPricing: true,
  installmentEnabled: true,
  customExpensePercent: true,
  customProfitPercent: true,
  customDiscountBufferPercent: true,
  customInstallmentMarkupPercent: true,
  customDownPaymentPercent: true,
  customInstallmentMonths: true,
  customCalculationMode: true,
  isActive: true,
  // Cosmetic catalogue fields any authenticated user may maintain.
  imageUrl: false,
  notes: false,
  sku: true,
  labelBarcodeSource: true,
  trackStock: true,
  stockQuantity: true,
  lowStockThreshold: true,
  specifications: false,
  specificationNotes: false,
} as const;

export const SERVICE_JOB_FIELD_POLICY = {
  customerId: true,
  productId: true,
  manualProductName: false,
  manualProductModel: false,
  manualProductBrand: false,
  manualProductNotes: false,
  requestType: true,
  issueDescription: true,
  requestedPartName: false,
  routingDecision: true,
  companyName: true,
  sentToCompanyDate: true,
  receivedFromCompanyDate: true,
  warrantyStatus: true,
  warrantyNotes: true,
  warrantyProvider: true,
  warrantyExpiresAt: true,
  estimatedPrice: true,
  finalPrice: true,
  priceNotes: true,
  serviceCreatedDate: true,
  homeVisitScheduledDate: true,
  returnedToCustomerDate: true,
  status: true,
  notes: false,
} as const;

export type ProductMutableField = keyof typeof PRODUCT_FIELD_POLICY;
export type ServiceJobMutableField = keyof typeof SERVICE_JOB_FIELD_POLICY;

export function containsSensitiveProductFields(fields: string[]): boolean {
  return fields.some((field) => PRODUCT_FIELD_POLICY[field as ProductMutableField] === true);
}

export function containsSensitiveServiceJobFields(fields: string[]): boolean {
  return fields.some((field) => SERVICE_JOB_FIELD_POLICY[field as ServiceJobMutableField] === true);
}

export function assertServiceAdmin(user: { role: string } | undefined): void {
  if (!user) throw new AuthorizationError('User not authenticated');
  if (user.role !== Role.ADMIN) {
    throw new AuthorizationError('Only administrators can perform service and product changes');
  }
}
