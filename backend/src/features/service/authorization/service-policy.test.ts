import { describe, expect, it } from 'vitest';
import {
  PRODUCT_FIELD_POLICY,
  SERVICE_JOB_FIELD_POLICY,
  containsSensitiveProductFields,
  containsSensitiveServiceJobFields,
} from './service-policy';

describe('service mutation policy', () => {
  it('classifies every planned product field', () => {
    expect(Object.keys(PRODUCT_FIELD_POLICY).sort()).toEqual(
      [
        'barcode', 'brand', 'discount', 'isActive', 'model', 'name', 'notes', 'price',
        'imageUrl', 'costPrice', 'pricingPresetId', 'useCustomPricing', 'customExpensePercent',
        'customProfitPercent', 'customDiscountBufferPercent', 'customInstallmentMarkupPercent',
        'customDownPaymentPercent', 'customInstallmentMonths', 'customCalculationMode',
        'sku', 'labelBarcodeSource', 'trackStock', 'stockQuantity', 'lowStockThreshold',
        'specifications', 'specificationNotes',
      ].sort()
    );
    expect(containsSensitiveProductFields(['price'])).toBe(true);
    expect(containsSensitiveProductFields(['notes'])).toBe(false);
    expect(containsSensitiveProductFields(['costPrice'])).toBe(true);
    expect(containsSensitiveProductFields(['imageUrl'])).toBe(false);
    expect(containsSensitiveProductFields(['sku', 'stockQuantity'])).toBe(true);
    expect(containsSensitiveProductFields(['specifications', 'specificationNotes'])).toBe(false);
  });

  it('keeps routine service notes and manual text non-sensitive', () => {
    expect(Object.keys(SERVICE_JOB_FIELD_POLICY)).toHaveLength(25);
    expect(containsSensitiveServiceJobFields(['notes', 'requestedPartName'])).toBe(false);
    expect(containsSensitiveServiceJobFields(['notes', 'finalPrice'])).toBe(true);
  });
});
