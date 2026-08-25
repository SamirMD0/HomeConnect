import { describe, expect, it } from 'vitest';
import type { Product } from '../../products/types/product.types';
import {
  buildQuickOrderPayload,
  initialQuickOrderState,
  productSellingPrice,
  quickOrderCustomerOptional,
  quickOrderErrorMessage,
  quickOrderStockAdvice,
  quickOrderTotals,
  validateQuickOrder,
} from './quick-order-payload';
import {
  addMoney,
  compareMoney,
  fromCents,
  isPositiveMoney,
  normalizeMoney,
  scaleMoney,
  subtractMoney,
  toCents,
} from './sales-money';

const today = '2026-08-22';

const product = (overrides: Partial<Product> = {}): Product => ({
  id: 'product-1',
  sku: 'HC-000001',
  name: 'Coffee grinder',
  model: 'CG-8',
  barcode: '1234567890123',
  brand: 'Home',
  price: '40.00',
  discount: null,
  netPrice: '38.00',
  isActive: true,
  imageUrl: null,
  image: null,
  notes: null,
  labelBarcodeSource: 'SKU',
  trackStock: true,
  stockQuantity: 4,
  lowStockThreshold: 1,
  stockStatus: 'IN_STOCK',
  specifications: [],
  specificationNotes: null,
  createdAt: '2026-08-20T10:00:00.000Z',
  updatedAt: '2026-08-20T10:00:00.000Z',
  pricing: {
    pricingAvailable: true,
    mode: 'PRESET',
    source: 'PRESET',
    pricingPresetId: 'preset-1',
    presetName: 'Standard',
    useCustomPricing: false,
    installmentEnabled: false,
    cashPrice: '35.00',
    warnings: [],
  },
  ...overrides,
});

const paidState = (item = product()) => ({
  ...initialQuickOrderState(item),
  customerId: 'customer-1',
});

describe('scanner quick-order money', () => {
  it('keeps the wizard cent algorithm and provides composed arithmetic', () => {
    expect(toCents('12.3')).toBe(1230n);
    expect(toCents('12.345')).toBe(0n);
    expect(toCents('-1.00')).toBe(0n);
    expect(fromCents(-1n)).toBe('0.00');
    expect(normalizeMoney('12.3')).toBe('12.30');
    expect(addMoney('10.50', '2.25')).toBe('12.75');
    expect(subtractMoney('10.00', '12.00')).toBe('0.00');
    expect(scaleMoney('3.25', 3)).toBe('9.75');
    expect(compareMoney('9.75', '9.74')).toBe(1);
    expect(isPositiveMoney('0.01')).toBe(true);
  });
});

describe('scanner quick-order payload', () => {
  it('builds exactly one catalog-product line with the required counter-sale constants', () => {
    const payload = buildQuickOrderPayload({ productId: 'product-1', state: paidState(), today });
    expect(payload).toMatchObject({
      salesChannel: 'SHOP_DIRECT',
      orderDate: today,
      fulfillmentStatus: 'DELIVERED',
      items: [{ productId: 'product-1', quantity: 1, unitPrice: '35.00' }],
    });
    expect(payload.items).toHaveLength(1);
  });

  it('defaults quantity to one and carries a changed quantity into both total and payload', () => {
    const state = paidState();
    expect(state.quantity).toBe(1);
    state.quantity = 3;
    expect(quickOrderTotals(state)).toMatchObject({ lineTotal: '105.00', total: '105.00', paidAmount: '105.00' });
    expect(buildQuickOrderPayload({ productId: 'product-1', state, today }).items[0].quantity).toBe(3);
  });

  it('derives price from cash price, then net price, then manual price, then zero', () => {
    expect(productSellingPrice(product())).toBe('35.00');
    const unavailable = {
      pricingAvailable: false as const,
      mode: 'NONE' as const,
      reason: 'Unavailable',
      pricingPresetId: null,
      presetName: null,
      useCustomPricing: false,
      installmentEnabled: false,
    };
    expect(productSellingPrice(product({ pricing: unavailable }))).toBe('38.00');
    expect(productSellingPrice(product({ pricing: unavailable, netPrice: null, price: '40.00' }))).toBe('40.00');
    expect(productSellingPrice(product({ pricing: unavailable, netPrice: null, price: null }))).toBe('0.00');
  });

  it('emits only the approved top-level and line keys', () => {
    const payload = buildQuickOrderPayload({ productId: 'product-1', state: paidState(), today });
    expect(Object.keys(payload).sort()).toEqual([
      'customerId', 'debtDueDate', 'fulfillmentStatus', 'items', 'notes', 'orderDate', 'paidAmount', 'salesChannel',
    ]);
    expect(Object.keys(payload.items[0]).sort()).toEqual(['productId', 'quantity', 'unitPrice']);
    const serialized = JSON.stringify(payload);
    for (const forbidden of [
      'deliveryDate', 'deliveryFee', 'deliveryAddressSnapshot', 'deliveryNotes', 'discountAmount',
      'manualProductName', 'manualProductModel', 'notes":"', 'stockQuantity', 'deduct-stock', 'restore-stock',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it('maps a paid order to the full total with no debt date', () => {
    const payload = buildQuickOrderPayload({ productId: 'product-1', state: paidState(), today });
    expect(payload.paidAmount).toBe('35.00');
    expect(payload.debtDueDate).toBeNull();
  });

  it('maps debt to zero paid, carries the due date, and requires a customer', () => {
    const state = { ...paidState(), paymentMode: 'DEBT' as const, customerId: '', debtDueDate: '2026-09-22' };
    expect(quickOrderTotals(state)).toMatchObject({ paidAmount: '0.00', remaining: '35.00' });
    expect(buildQuickOrderPayload({ productId: 'product-1', state, today })).toMatchObject({
      customerId: null,
      paidAmount: '0.00',
      debtDueDate: '2026-09-22',
    });
    expect(validateQuickOrder(state, { isAdmin: true, today }).customerId).toContain('Choose a customer');
  });

  it('normalizes a valid partial payment and calculates the remaining balance', () => {
    const state = {
      ...paidState(),
      paymentMode: 'PARTIAL' as const,
      partialAmount: '10.5',
      debtDueDate: '2026-09-22',
    };
    expect(quickOrderTotals(state)).toEqual({ lineTotal: '35.00', total: '35.00', paidAmount: '10.50', remaining: '24.50' });
    expect(buildQuickOrderPayload({ productId: 'product-1', state, today }).paidAmount).toBe('10.50');
    expect(validateQuickOrder(state, { isAdmin: true, today })).toEqual({});
  });

  it.each(['0', '0.00', '35.00', '40.00'])('rejects partial payment %s outside the strict bounds', (partialAmount) => {
    const state = {
      ...paidState(),
      paymentMode: 'PARTIAL' as const,
      partialAmount,
      debtDueDate: '2026-09-22',
    };
    expect(validateQuickOrder(state, { isAdmin: true, today }).partialAmount).toBeDefined();
  });

  it('makes the customer optional only for an admin with no remaining balance', () => {
    const paid = { ...paidState(), customerId: '' };
    const debt = { ...paid, paymentMode: 'DEBT' as const, debtDueDate: '2026-09-22' };
    expect(quickOrderCustomerOptional(paid, true)).toBe(true);
    expect(quickOrderCustomerOptional(paid, false)).toBe(false);
    expect(quickOrderCustomerOptional(debt, true)).toBe(false);
    expect(validateQuickOrder(paid, { isAdmin: false, today }).customerId).toContain('Employees');
    expect(validateQuickOrder(debt, { isAdmin: true, today }).customerId).toContain('remaining balance');
  });

  it('requires a due date for a balance and rejects a date before today', () => {
    const debt = { ...paidState(), paymentMode: 'DEBT' as const, debtDueDate: '' };
    expect(validateQuickOrder(debt, { isAdmin: true, today }).debtDueDate).toContain('required');
    expect(validateQuickOrder({ ...debt, debtDueDate: '2026-08-21' }, { isAdmin: true, today }).debtDueDate)
      .toContain('cannot be before');
  });

  it.each(['0', '0.00'])('blocks zero unit price %s', (unitPrice) => {
    expect(validateQuickOrder({ ...paidState(), unitPrice }, { isAdmin: true, today }).unitPrice).toBeDefined();
  });

  it.each([0, 1000])('blocks quantity %i outside the backend range', (quantity) => {
    expect(validateQuickOrder({ ...paidState(), quantity }, { isAdmin: true, today }).quantity).toBeDefined();
  });

  it('allows an over-stock quantity to validate and still yields a submit payload', () => {
    const item = product({ stockQuantity: 1 });
    const state = { ...paidState(item), quantity: 5 };
    expect(quickOrderStockAdvice(item, state.quantity)).toMatchObject({ overSelling: true, tone: 'warning' });
    expect(validateQuickOrder(state, { isAdmin: true, today })).toEqual({});
    expect(buildQuickOrderPayload({ productId: item.id, state, today }).items[0].quantity).toBe(5);
  });

  it('keeps untracked and sufficient stock informational', () => {
    expect(quickOrderStockAdvice(product({ trackStock: false, stockStatus: 'NOT_TRACKED' }), 100))
      .toMatchObject({ overSelling: false, tone: 'info' });
    expect(quickOrderStockAdvice(product({ stockQuantity: 4 }), 4))
      .toMatchObject({ overSelling: false, tone: 'info' });
  });

  it('trims optional order notes without adding line notes', () => {
    const payload = buildQuickOrderPayload({ productId: 'product-1', state: { ...paidState(), notes: '  Counter sale  ' }, today });
    expect(payload.notes).toBe('Counter sale');
    expect(payload.items[0]).not.toHaveProperty('notes');
  });

  it('prefers the nested server message, then the response message, then the bilingual fallback', () => {
    expect(quickOrderErrorMessage({ isAxiosError: true, response: { data: { error: { message: 'Exact server failure' } } } }))
      .toBe('Exact server failure');
    expect(quickOrderErrorMessage({ isAxiosError: true, response: { data: { message: 'Older server failure' } } }))
      .toBe('Older server failure');
    expect(quickOrderErrorMessage(new Error('offline'))).toBe('Unable to create sales order / تعذر إنشاء طلب البيع');
  });
});
