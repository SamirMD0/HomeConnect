import { Role } from '@prisma/client';
import { AuthorizationError } from '../../../lib/errors';
import { requireRole } from '../../../middleware/role.middleware';

export const requireSupplierAdmin = requireRole([Role.ADMIN]);
export const SUPPLIER_SENSITIVE_FIELDS = ['name', 'phone'] as const;

export function containsSensitiveSupplierFields(fields: string[]): boolean {
  return fields.some((field) => (SUPPLIER_SENSITIVE_FIELDS as readonly string[]).includes(field));
}

export function assertSupplierAdmin(user: { role: string } | undefined): void {
  if (!user || user.role !== Role.ADMIN) {
    throw new AuthorizationError('Only administrators can change supplier records');
  }
}
