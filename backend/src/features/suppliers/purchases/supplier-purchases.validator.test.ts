import { beforeEach, describe, expect, it } from 'vitest';
import { createSupplierPurchaseSchema } from './supplier-purchases.validator';

const productId = '33333333-3333-4333-8333-333333333333';
const today = () => new Date().toISOString().slice(0, 10);

const base = (overrides: Record<string, unknown> = {}) => ({
  receiptNumber: 'INV-2291',
  transactionDate: today(),
  description: 'TCL AC purchase',
  receiveStock: true,
  lines: [{ kind: 'EXISTING_PRODUCT', productId, quantity: 3, unitPrice: '210.00' }],
  ...overrides,
});

const quickAdd = { kind: 'NEW_PRODUCT', name: 'TCL AC 2HP', model: 'TAC-24', quantity: 2, unitPrice: '300.00' };
const messagesFor = (input: unknown) => {
  const result = createSupplierPurchaseSchema.safeParse(input);
  return result.success ? [] : result.error.issues.map((issue) => issue.message);
};

describe('createSupplierPurchaseSchema', () => {
  beforeEach(() => { process.env.BUSINESS_TIMEZONE = 'Asia/Beirut'; });

  it('accepts a purchase of an existing product', () => {
    expect(createSupplierPurchaseSchema.safeParse(base()).success).toBe(true);
  });

  it('accepts a manual description line with no product', () => {
    expect(createSupplierPurchaseSchema.safeParse(base({
      lines: [{ kind: 'MANUAL', description: 'Delivery to shop', amount: '25.00' }],
    })).success).toBe(true);
  });

  it('rejects a manual line carrying a product or a quantity', () => {
    expect(createSupplierPurchaseSchema.safeParse(base({
      lines: [{ kind: 'MANUAL', description: 'Delivery', amount: '25.00', productId, quantity: 2 }],
    })).success).toBe(false);
  });

  it('rejects a manual line worth nothing', () => {
    expect(createSupplierPurchaseSchema.safeParse(base({
      lines: [{ kind: 'MANUAL', description: 'Nothing', amount: '0' }],
    })).success).toBe(false);
  });

  it('allows a zero unit price so bonus stock can be received', () => {
    expect(createSupplierPurchaseSchema.safeParse(base({
      lines: [{ kind: 'EXISTING_PRODUCT', productId, quantity: 1, unitPrice: '0' }],
    })).success).toBe(true);
  });

  it('rejects the same product on two lines and says how to fix it', () => {
    expect(messagesFor(base({
      lines: [
        { kind: 'EXISTING_PRODUCT', productId, quantity: 1, unitPrice: '210.00' },
        { kind: 'EXISTING_PRODUCT', productId, quantity: 2, unitPrice: '215.00' },
      ],
    }))).toContainEqual(expect.stringContaining('combine the quantities'));
  });

  it('rejects a purchase with no lines', () => {
    expect(createSupplierPurchaseSchema.safeParse(base({ lines: [] })).success).toBe(false);
  });

  it('rejects a future purchase date', () => {
    expect(messagesFor(base({ transactionDate: '2099-01-01' }))).toContain('Future purchase dates are not allowed');
  });

  it('requires the account password when a new product is being added', () => {
    expect(messagesFor(base({ lines: [quickAdd] })))
      .toContainEqual(expect.stringContaining('account password is required'));
    expect(createSupplierPurchaseSchema.safeParse(base({ lines: [quickAdd], accountPassword: 'secret' })).success).toBe(true);
  });

  it('refuses to add a new product on a purchase that receives no stock', () => {
    expect(messagesFor(base({ lines: [quickAdd], accountPassword: 'secret', receiveStock: false })))
      .toContainEqual(expect.stringContaining('receives stock'));
  });

  it('refuses to backdate a purchase that adds a new product', () => {
    expect(messagesFor(base({ lines: [quickAdd], accountPassword: 'secret', transactionDate: '2026-01-01' })))
      .toContainEqual(expect.stringContaining('must be dated today'));
  });

  it('requires a reason for a hand-set total, and an amount for a reason', () => {
    expect(messagesFor(base({ amountOverride: '600.00' })))
      .toContainEqual(expect.stringContaining('reason is required'));
    expect(messagesFor(base({ amountOverrideReason: 'Discount applied' })))
      .toContainEqual(expect.stringContaining('without an override amount'));
    expect(createSupplierPurchaseSchema.safeParse(base({ amountOverride: '600.00', amountOverrideReason: 'Bulk discount' })).success).toBe(true);
  });

  it('rejects an override total of zero', () => {
    expect(createSupplierPurchaseSchema.safeParse(base({ amountOverride: '0', amountOverrideReason: 'Bulk discount' })).success).toBe(false);
  });

  it('rejects unknown fields rather than silently dropping them', () => {
    expect(createSupplierPurchaseSchema.safeParse(base({ supplierReceivingId: productId })).success).toBe(false);
  });

  it('defaults receiveStock to true so stock is not silently skipped', () => {
    const parsed = createSupplierPurchaseSchema.parse({
      transactionDate: today(), description: 'TCL AC purchase',
      lines: [{ kind: 'EXISTING_PRODUCT', productId, quantity: 1, unitPrice: '10.00' }],
    });
    expect(parsed.receiveStock).toBe(true);
  });
});
