import { SupplierTransactionDirection as Direction, SupplierTransactionType as Type } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { resolveSupplierDirection } from './supplier-domain';

describe('supplier domain', () => {
  it('forces directions for standard transaction types', () => {
    expect(resolveSupplierDirection(Type.SUPPLIER_DEBT)).toBe(Direction.INCREASE_OWED);
    expect(resolveSupplierDirection(Type.SUPPLIER_PAYMENT)).toBe(Direction.DECREASE_OWED);
    expect(resolveSupplierDirection(Type.SUPPLIER_CREDIT)).toBe(Direction.DECREASE_OWED);
  });
  it('requires explicit adjustment direction and rejects mismatches', () => {
    expect(() => resolveSupplierDirection(Type.SUPPLIER_ADJUSTMENT)).toThrow('Direction is required');
    expect(resolveSupplierDirection(Type.SUPPLIER_ADJUSTMENT, Direction.INCREASE_OWED)).toBe(Direction.INCREASE_OWED);
    expect(() => resolveSupplierDirection(Type.SUPPLIER_DEBT, Direction.DECREASE_OWED)).toThrow('does not match');
  });
});
