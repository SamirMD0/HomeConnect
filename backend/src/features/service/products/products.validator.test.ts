import { describe, expect, it } from 'vitest';
import {
  createProductSchema,
  productDuplicateQuerySchema,
  productListQuerySchema,
  updateProductSchema,
  updateProductStockSchema,
} from './products.validator';

describe('product validation', () => {
  it('accepts Arabic names and optional product fields', () => {
    expect(createProductSchema.parse({ name: 'مروحة', model: 'F-100' }).name).toBe('مروحة');
  });

  it('accepts complete product pricing during creation and validates custom pricing', () => {
    const presetId = '33333333-3333-4333-8333-333333333333';
    expect(createProductSchema.parse({ name: 'AC', model: 'A1', costPrice: '300.00', pricingPresetId: presetId }))
      .toMatchObject({ costPrice: '300.00', pricingPresetId: presetId });
    expect(() => createProductSchema.parse({ name: 'AC', model: 'A1', pricingPresetId: presetId })).toThrow('Cost price');
    expect(() => createProductSchema.parse({ name: 'AC', model: 'A1', costPrice: '300.00', useCustomPricing: true })).toThrow('Required');
  });

  it('allows cash-only custom pricing and requires installment fields only when enabled', () => {
    const cashOnly = {
      name: 'Accessory', model: 'A15', costPrice: '10.00', useCustomPricing: true,
      installmentEnabled: false, customExpensePercent: '5', customProfitPercent: '20',
      customDiscountBufferPercent: '5', customCalculationMode: 'COMPOUND',
    };
    expect(createProductSchema.parse(cashOnly)).toMatchObject({ installmentEnabled: false });
    expect(() => createProductSchema.parse({ ...cashOnly, installmentEnabled: true })).toThrow('Required');
  });

  it('treats false pricing booleans as no pricing configuration', () => {
    expect(createProductSchema.parse({
      name: 'Fan', model: 'F1', useCustomPricing: false, installmentEnabled: false,
    })).toMatchObject({ useCustomPricing: false, installmentEnabled: false });
  });

  it('requires a barcode when manufacturer label mode is selected', () => {
    expect(() => createProductSchema.parse({ name: 'Fan', model: 'F1', labelBarcodeSource: 'MANUFACTURER' })).toThrow('manufacturer barcode');
    expect(createProductSchema.parse({ name: 'Fan', model: 'F1', labelBarcodeSource: 'MANUFACTURER', barcode: 'ABCD-1234' }).barcode).toBe('ABCD-1234');
  });

  it('rejects invalid barcode and discount above price', () => {
    expect(() => createProductSchema.parse({ name: 'Fan', model: 'F1', barcode: 'bad value' })).toThrow();
    expect(() => createProductSchema.parse({ name: 'Fan', model: 'F1', price: '10.00', discount: '11.00' })).toThrow('Discount');
  });

  it('normalizes empty optional fields and validates decimal amounts without floats', () => {
    const parsed = createProductSchema.parse({
      name: 'Fan', model: 'F1', barcode: '', brand: ' ', price: '', discount: '', notes: '',
    });
    expect(parsed).toMatchObject({ barcode: null, brand: null, price: null, discount: null, notes: null });
    expect(() => createProductSchema.parse({ name: 'Fan', model: 'F1', price: '9999999999.98', discount: '9999999999.99' })).toThrow('Discount');
  });

  it('parses product filters and rejects unsupported sorting', () => {
    expect(productListQuerySchema.parse({ brand: 'سامسونج', hasBarcode: 'true', sortBy: 'price', sortOrder: 'desc' }))
      .toMatchObject({ brand: 'سامسونج', hasBarcode: true, sortBy: 'price', sortOrder: 'desc', page: 1, pageSize: 25 });
    expect(() => productListQuerySchema.parse({ sortBy: 'barcode' })).toThrow();
  });

  it('takes sensitive and notes-only updates without credentials', () => {
    // v1.8.1: the field policy still decides WHO may edit a sensitive field, but
    // the schema no longer demands a reason or a password to do it.
    expect(updateProductSchema.parse({ model: 'F2' }).model).toBe('F2');
    expect(updateProductSchema.parse({ notes: 'ملاحظة جديدة' }).notes).toBe('ملاحظة جديدة');
  });

  it('accepts duplicate checks with Arabic product text', () => {
    expect(productDuplicateQuerySchema.parse({ name: 'مروحة', model: 'F1', brand: '' }))
      .toEqual({ name: 'مروحة', model: 'F1', brand: null });
  });
  it('rejects client SKU and stock writes during product creation', () => {
    expect(() => createProductSchema.parse({ name: 'Fan', model: 'F1', sku: 'HC-999999' })).toThrow();
    expect(() => createProductSchema.parse({ name: 'Fan', model: 'F1', stockQuantity: 4 })).toThrow();
  });
  it('normalizes ordered specifications and keeps stock settings quantity-free', () => {
    expect(createProductSchema.parse({ name: 'Fan', model: 'F1', specifications: [{ label: ' Color ', value: ' Silver ' }, { label: '', value: '' }] }).specifications)
      .toEqual([{ label: 'Color', value: 'Silver' }]);
    const stockSettings = { trackStock: true, lowStockThreshold: 2 };
    expect(updateProductStockSchema.parse(stockSettings)).toEqual(stockSettings);
    expect(() => updateProductStockSchema.parse({ ...stockSettings, stockQuantity: 2 })).toThrow();
  });
  it('rejects a reason or account password on the relaxed stock-settings schema', () => {
    expect(() => updateProductStockSchema.parse({ trackStock: true, lowStockThreshold: 2, accountPassword: 'secret' })).toThrow();
    expect(() => updateProductStockSchema.parse({ trackStock: true, lowStockThreshold: 2, reason: 'Update stock settings' })).toThrow();
  });
  it('keeps pricing fields off the relaxed product update schema', () => {
    expect(updateProductSchema.parse({ name: 'Fan' })).toEqual({ name: 'Fan' });
    for (const pricingField of ['costPrice', 'pricingPresetId', 'useCustomPricing', 'customProfitPercent', 'customCalculationMode']) {
      expect(() => updateProductSchema.parse({ name: 'Fan', [pricingField]: '10.00' })).toThrow();
    }
  });
  it('no longer accepts a typed reason or account password on a product update', () => {
    expect(() => updateProductSchema.parse({ name: 'Fan', reason: 'Correct the name' })).toThrow();
    expect(() => updateProductSchema.parse({ name: 'Fan', accountPassword: 'secret' })).toThrow();
  });
});
