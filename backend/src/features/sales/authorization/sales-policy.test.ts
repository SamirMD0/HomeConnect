import { Role } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { assertSalesAdmin, containsSensitiveSalesOrderFields } from './sales-policy';

describe('sales authorization policy', () => {
  it('classifies sensitive fields', () => {
    expect(containsSensitiveSalesOrderFields(['notes'])).toBe(false);
    expect(containsSensitiveSalesOrderFields(['notes', 'unitPrice'])).toBe(true);
  });

  it('requires an administrator for admin-only actions', () => {
    expect(() => assertSalesAdmin({ role: Role.ADMIN })).not.toThrow();
    expect(() => assertSalesAdmin({ role: Role.EMPLOYEE })).toThrow();
  });
});
