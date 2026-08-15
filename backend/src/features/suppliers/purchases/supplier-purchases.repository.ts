import { Prisma, SupplierTransactionStatus, SupplierTransactionType } from '@prisma/client';
import { prisma } from '../../../lib/prisma';

export const purchaseLineInclude = {
  product: { select: { id: true, sku: true, name: true, model: true, trackStock: true, stockQuantity: true } },
  receivingItem: { select: { id: true, receivingId: true, quantity: true, stockMovementId: true } },
} satisfies Prisma.SupplierPurchaseLineInclude;

export const supplierPurchaseInclude = {
  supplier: { select: { id: true, name: true, phone: true, companyName: true, isActive: true } },
  createdBy: { select: { id: true, fullName: true, username: true } },
  supplierReceiving: {
    select: {
      id: true, referenceNumber: true, receivedOn: true,
      items: { select: { id: true, quantity: true, product: { select: { id: true, name: true, sku: true } } }, orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }] },
    },
  },
  purchaseLines: { include: purchaseLineInclude, orderBy: [{ position: 'asc' as const }] },
} satisfies Prisma.SupplierTransactionInclude;

export class SupplierPurchasesRepository {
  static createLine(data: Prisma.SupplierPurchaseLineUncheckedCreateInput, tx: Prisma.TransactionClient) {
    return tx.supplierPurchaseLine.create({ data });
  }

  static findById(id: string, tx?: Prisma.TransactionClient) {
    return (tx ?? prisma).supplierTransaction.findUnique({ where: { id }, include: supplierPurchaseInclude });
  }

  /**
   * Purchases are supplier debts that carry lines. A plain debt typed straight
   * into the ledger has none, and is intentionally absent from this list.
   */
  static async listForSupplier(supplierId: string, page: number, pageSize: number) {
    const where: Prisma.SupplierTransactionWhereInput = {
      supplierId,
      type: SupplierTransactionType.SUPPLIER_DEBT,
      purchaseLines: { some: {} },
    };
    const [items, total] = await Promise.all([
      prisma.supplierTransaction.findMany({
        where, include: supplierPurchaseInclude,
        orderBy: [{ transactionDate: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize, take: pageSize,
      }),
      prisma.supplierTransaction.count({ where }),
    ]);
    return { items, total };
  }

  /**
   * Warning support, not a uniqueness check: suppliers reuse receipt numbers, so
   * this reports what already exists and lets the user decide.
   */
  static findReceiptMatches(supplierId: string, receiptNumber: string) {
    return prisma.supplierTransaction.findMany({
      where: {
        supplierId,
        status: SupplierTransactionStatus.ACTIVE,
        receiptNumber: { equals: receiptNumber, mode: 'insensitive' },
      },
      select: { id: true, receiptNumber: true, amount: true, transactionDate: true, description: true },
      orderBy: [{ transactionDate: 'desc' }, { createdAt: 'desc' }],
      take: 5,
    });
  }
}
