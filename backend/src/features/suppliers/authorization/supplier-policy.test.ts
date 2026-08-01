import { describe, expect, it } from 'vitest';
import { assertSupplierAdmin, containsSensitiveSupplierFields } from './supplier-policy';

describe('supplier policy', () => {
  it('protects mutations and identifies sensitive supplier identity fields', () => {
    expect(() => assertSupplierAdmin({ role: 'EMPLOYEE' })).toThrow('Only administrators');
    expect(() => assertSupplierAdmin({ role: 'ADMIN' })).not.toThrow();
    expect(containsSensitiveSupplierFields(['notes'])).toBe(false);
    expect(containsSensitiveSupplierFields(['phone'])).toBe(true);
  });
});
