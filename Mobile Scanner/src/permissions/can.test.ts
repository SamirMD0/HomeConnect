import { describe, expect, it } from 'vitest';
import { can } from './can';
describe('desktop-compatible mobile visibility', () => {
  it.each(['ADMIN', 'EMPLOYEE', 'MANAGER', 'CASHIER'])(
    'allows signed-in %s to use unrestricted desktop sections',
    (role) => {
      for (const permission of [
        'scan',
        'stock',
        'sell',
        'suppliers.read',
        'supplierBills.capture',
      ] as const)
        expect(can(permission, { role })).toBe(true);
    }
  );
  it.each(['ADMIN', 'EMPLOYEE', 'MANAGER', 'CASHIER'])(
    'does not grant %s supplier-admin writes that desktop would hide',
    (role) => {
      expect(can('supplierInvoices.write', { role })).toBe(role === 'ADMIN');
      expect(can('supplierPayments.write', { role })).toBe(role === 'ADMIN');
      expect(can('settings.admin', { role })).toBe(role === 'ADMIN');
    }
  );
  it('hides actions before authentication', () => {
    expect(can('scan', null)).toBe(false);
    expect(can('supplierInvoices.write', undefined)).toBe(false);
  });
});
