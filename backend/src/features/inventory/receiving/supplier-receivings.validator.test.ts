import { describe, expect, it } from 'vitest';
import { createSupplierReceivingSchema, supplierReceivingDuplicateSchema, supplierReceivingParamsSchema } from './supplier-receivings.validator';

const productId = '02880843-6f16-93fb-2ecc-091af51a07b4';
const supplierId = '11111111-1111-4111-8111-111111111111';

describe('supplier receiving validation', () => {
  it('accepts legacy database UUIDs, optional supplier, blank text normalization, and valid quantities', () => {
    const result = createSupplierReceivingSchema.parse({ referenceNumber: '  ', note: '', items: [{ productId, quantity: 1 }] });
    expect(result).toMatchObject({ referenceNumber: null, note: null, items: [{ productId, quantity: 1 }] });
    expect(supplierReceivingParamsSchema.safeParse({ receivingId: productId }).success).toBe(true);
  });

  it.each([0, -1, 1.5, 100_001])('rejects invalid quantity %s', (quantity) => {
    expect(createSupplierReceivingSchema.safeParse({ items: [{ productId, quantity }] }).success).toBe(false);
  });

  it('rejects duplicate products, future-shaped invalid dates, and unknown fields', () => {
    expect(createSupplierReceivingSchema.safeParse({ items: [{ productId, quantity: 1 }, { productId, quantity: 2 }] }).success).toBe(false);
    expect(createSupplierReceivingSchema.safeParse({ receivedOn: '2026-02-30', items: [{ productId, quantity: 1 }] }).success).toBe(false);
    expect(createSupplierReceivingSchema.safeParse({ items: [{ productId, quantity: 1 }], accountPassword: 'secret' }).success).toBe(false);
  });

  it('requires both fields for the duplicate warning endpoint', () => {
    expect(supplierReceivingDuplicateSchema.safeParse({ supplierId, referenceNumber: ' INV-1 ' }).success).toBe(true);
    expect(supplierReceivingDuplicateSchema.safeParse({ supplierId, referenceNumber: ' ' }).success).toBe(false);
    expect(supplierReceivingDuplicateSchema.safeParse({ supplierId }).success).toBe(false);
  });
});
