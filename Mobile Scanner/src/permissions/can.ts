export type Permission =
  | 'scan'
  | 'sell'
  | 'stock'
  | 'suppliers.read'
  | 'supplierBills.capture'
  | 'supplierInvoices.write'
  | 'supplierPayments.write'
  | 'settings.admin'
  | 'reports.read';
const adminOnly = new Set<Permission>([
  'supplierInvoices.write',
  'supplierPayments.write',
  'settings.admin',
  'reports.read',
]);
/** Mirrors desktop NAVIGATION.isItemVisible and requireSupplierAdmin. Unknown
 * roles (including future manager/cashier names) receive no admin write rights. */
export function can(permission: Permission, user: { role: string } | null | undefined): boolean {
  if (!user) return false;
  return !adminOnly.has(permission) || user.role === 'ADMIN';
}
