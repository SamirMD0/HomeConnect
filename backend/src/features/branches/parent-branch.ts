import { prisma } from '../../lib/prisma';
import { assertInScope, type BranchScope } from './branch-scope';
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

/** Branch-only reads shared by HTTP record guards and transactional link checks. */
export type ScopeRecordKind =
  | 'customer'
  | 'supplier'
  | 'debt'
  | 'installmentPlan'
  | 'installment'
  | 'payment'
  | 'prepaid'
  | 'salesOrder'
  | 'salesReturn'
  | 'customerCredit'
  | 'serviceJob'
  | 'supplierTransaction'
  | 'supplierPurchase'
  | 'receiving'
  | 'receiptReceiving';

export const scopeRecordMissing: Record<ScopeRecordKind, string> = {
  customer: 'Customer not found',
  supplier: 'Supplier not found',
  debt: 'Debt not found',
  installmentPlan: 'Installment plan not found',
  installment: 'Installment not found',
  payment: 'Payment not found',
  prepaid: 'Prepaid purchase not found',
  salesOrder: 'Sales order not found',
  salesReturn: 'Sales return not found',
  customerCredit: 'Customer credit not found',
  serviceJob: 'Service job not found',
  supplierTransaction: 'Supplier transaction not found',
  supplierPurchase: 'Purchase not found / الفاتورة غير موجودة',
  receiving: 'Receiving not found / مستند الاستلام غير موجود',
  receiptReceiving: 'The supplier purchase for this receipt was not found.',
};

export async function findScopeRecord(
  kind: ScopeRecordKind,
  id: string,
  client: Prisma.TransactionClient = prisma
): Promise<{ branchId: string } | null> {
  if (kind === 'prepaid') {
    const row = await client.prepaidPurchase.findUnique({
      where: { id },
      select: { debt: { select: { branchId: true } } },
    });
    return row?.debt ?? null;
  }
  if (kind === 'installment') {
    const row = await client.installment.findUnique({
      where: { id },
      select: { installmentPlan: { select: { branchId: true } } },
    });
    return row?.installmentPlan ?? null;
  }
  const query = { where: { id }, select: { branchId: true } } as const;
  const load = {
    customer: () => client.customer.findUnique(query),
    supplier: () => client.supplier.findUnique(query),
    debt: () => client.debt.findUnique(query),
    installmentPlan: () => client.installmentPlan.findUnique(query),
    payment: () => client.payment.findUnique(query),
    salesOrder: () => client.salesOrder.findUnique(query),
    salesReturn: () => client.salesReturn.findUnique(query),
    customerCredit: () => client.customerCredit.findUnique(query),
    serviceJob: () => client.serviceJob.findUnique(query),
    supplierTransaction: () => client.supplierTransaction.findUnique(query),
    supplierPurchase: () => client.supplierTransaction.findUnique(query),
    receiving: () => client.supplierReceiving.findUnique(query),
    receiptReceiving: () => client.supplierReceiving.findUnique(query),
  };
  return load[kind]();
}

export async function assertRecordInScope(
  kind: ScopeRecordKind,
  id: string,
  scope: BranchScope,
  tx: Prisma.TransactionClient = prisma,
  missingMessage = scopeRecordMissing[kind]
): Promise<string> {
  const record = await findScopeRecord(kind, id, tx);
  if (!record) throw new NotFoundError(missingMessage);
  assertInScope(record.branchId, scope, missingMessage);
  return record.branchId;
}
