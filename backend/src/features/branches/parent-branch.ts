import type { Prisma } from '@prisma/client';
import { NotFoundError } from '../../lib/errors';

export async function customerBranch(customerId: string, tx: Prisma.TransactionClient) {
  const parent = await tx.customer.findUnique({
    where: { id: customerId },
    select: { branchId: true },
  });
  if (!parent) throw new NotFoundError('Customer not found');
  return parent.branchId;
}
export async function supplierBranch(supplierId: string, tx: Prisma.TransactionClient) {
  const parent = await tx.supplier.findUnique({
    where: { id: supplierId },
    select: { branchId: true },
  });
  if (!parent) throw new NotFoundError('Supplier not found');
  return parent.branchId;
}
export async function salesOrderBranch(salesOrderId: string, tx: Prisma.TransactionClient) {
  const parent = await tx.salesOrder.findUnique({
    where: { id: salesOrderId },
    select: { branchId: true },
  });
  if (!parent) throw new NotFoundError('Sales order not found');
  return parent.branchId;
}
export async function paymentBranch(
  data: { salesOrderId?: string | null; customerId?: string | null },
  tx: Prisma.TransactionClient
) {
  if (data.salesOrderId) return salesOrderBranch(data.salesOrderId, tx);
  if (data.customerId) return customerBranch(data.customerId, tx);
  throw new NotFoundError('Payment parent not found');
}
