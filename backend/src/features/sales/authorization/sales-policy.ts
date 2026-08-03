import { Role } from '@prisma/client';
import { AuthorizationError } from '../../../lib/errors';
import { requireRole } from '../../../middleware/role.middleware';

export const requireSalesAdmin = requireRole([Role.ADMIN]);

export const SALES_ORDER_FIELD_POLICY = {
  customerId: true,
  orderDate: true,
  salesChannel: true,
  deliveryDate: true,
  deliveryFee: true,
  paidAmount: true,
  fulfillmentStatus: true,
  unitPrice: true,
  discountAmount: true,
  quantity: true,
  productId: true,
  notes: false,
  deliveryNotes: false,
  deliveryAddressSnapshot: false,
  manualProductName: false,
  manualProductModel: false,
  itemNotes: false,
} as const;

type SalesOrderMutableField = keyof typeof SALES_ORDER_FIELD_POLICY;

export function containsSensitiveSalesOrderFields(fields: string[]): boolean {
  return fields.some((field) => SALES_ORDER_FIELD_POLICY[field as SalesOrderMutableField] === true);
}

export function assertSalesAdmin(user: { role: string } | undefined): void {
  if (!user) throw new AuthorizationError('User not authenticated');
  if (user.role !== Role.ADMIN) throw new AuthorizationError('Only administrators can perform this sales order action');
}
