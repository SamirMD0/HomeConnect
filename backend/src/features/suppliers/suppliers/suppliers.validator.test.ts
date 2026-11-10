import { describe, expect, it } from 'vitest';
import { createSupplierSchema, updateSupplierSchema } from './suppliers.validator';

describe('supplier validation', () => {
  it('accepts Arabic text and rejects address', () => {
    expect(createSupplierSchema.parse({ name: 'شركة النور', phone: '03 123 456' }).name).toBe('شركة النور');
    expect(() => createSupplierSchema.parse({ name: 'Supplier', phone: '03123456', address: 'Beirut' })).toThrow();
  });
  it('lets admins change supplier identity without a password or reason', () => {
    expect(updateSupplierSchema.parse({ name: 'New Name' }).name).toBe('New Name');
    expect(updateSupplierSchema.parse({ notes: 'Updated supplier note' }).notes).toBe('Updated supplier note');
  });
});
