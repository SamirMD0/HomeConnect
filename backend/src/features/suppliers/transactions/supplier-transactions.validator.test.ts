import { SupplierTransactionDirection, SupplierTransactionType } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { createSupplierTransactionSchema, supplierLedgerQuerySchema } from './supplier-transactions.validator';

const valid = { type: SupplierTransactionType.SUPPLIER_DEBT, amount: '500.00', transactionDate: '2026-07-30', description: 'Air conditioners received' };
describe('supplier transaction validation', () => {
  it('accepts decimal strings and bilingual descriptions', () => {
    expect(createSupplierTransactionSchema.parse({ ...valid, description: 'مكيفات مستلمة' }).amount).toBe('500.00');
  });
  it('accepts receiving references up to 200 characters', () => {
    expect(createSupplierTransactionSchema.parse({ ...valid, reference: 'R'.repeat(200) }).reference).toHaveLength(200);
    expect(() => createSupplierTransactionSchema.parse({ ...valid, reference: 'R'.repeat(201) })).toThrow();
  });
  it('rejects zero, future dates and mismatched directions', () => {
    expect(() => createSupplierTransactionSchema.parse({ ...valid, amount: '0.00' })).toThrow();
    expect(() => createSupplierTransactionSchema.parse({ ...valid, transactionDate: '2999-01-01' })).toThrow();
    expect(() => createSupplierTransactionSchema.parse({ ...valid, direction: SupplierTransactionDirection.DECREASE_OWED })).toThrow();
  });
  it('requires an adjustment direction', () => {
    expect(() => createSupplierTransactionSchema.parse({ ...valid, type: SupplierTransactionType.SUPPLIER_ADJUSTMENT })).toThrow();
  });
});

describe('supplier ledger date filters', () => {
  it('accepts a future dateTo so month-end ranges are not rejected', () => {
    const parsed = supplierLedgerQuerySchema.parse({ dateFrom: '2026-07-01', dateTo: '2999-12-31' });
    expect(parsed.dateTo).toBe('2999-12-31');
  });

  it('accepts a future dateFrom', () => {
    expect(supplierLedgerQuerySchema.parse({ dateFrom: '2999-01-01' }).dateFrom).toBe('2999-01-01');
  });

  it('still rejects malformed filter dates', () => {
    expect(() => supplierLedgerQuerySchema.parse({ dateTo: '30-07-2026' })).toThrow();
    expect(() => supplierLedgerQuerySchema.parse({ dateFrom: '2026-13-40' })).toThrow();
  });

  it('keeps the no-future rule on the transaction date itself', () => {
    expect(() => createSupplierTransactionSchema.parse({ ...valid, transactionDate: '2999-01-01' })).toThrow();
  });
});
