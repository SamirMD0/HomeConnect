import { Prisma, SupplierReceivingItemStatus, SupplierReceivingStatus } from '@prisma/client';
import { prisma } from '../../../lib/prisma';

const actorSelect = { select: { id: true, fullName: true, username: true } };

const listInclude = {
  supplier: { select: { id: true, name: true, isActive: true } },
  receivedBy: actorSelect,
  _count: { select: { items: true, transactions: true } },
} satisfies Prisma.SupplierReceivingInclude;

const detailInclude = {
  supplier: { select: { id: true, name: true, isActive: true } },
  receivedBy: actorSelect,
  voidedBy: actorSelect,
  items: {
    include: {
      product: { select: { id: true, sku: true, name: true, stockQuantity: true } },
      stockMovement: true,
      reversalStockMovement: true,
      reversedBy: actorSelect,
    },
    orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }],
  },
  transactions: {
    select: { id: true, type: true, status: true, amount: true },
    take: 1,
  },
  audits: {
    select: {
      id: true, action: true, changedByName: true, changedByUsername: true,
      changedAt: true, reason: true,
    },
    orderBy: [{ changedAt: 'desc' as const }, { id: 'desc' as const }],
  },
} satisfies Prisma.SupplierReceivingInclude;

export class SupplierReceivingsRepository {
  static findSupplier(id: string, tx: Prisma.TransactionClient) {
    return tx.supplier.findUnique({ where: { id }, select: { id: true, name: true, isActive: true } });
  }
  static create(data: Prisma.SupplierReceivingUncheckedCreateInput, tx: Prisma.TransactionClient) {
    return tx.supplierReceiving.create({ data });
  }
  static createItem(data: Prisma.SupplierReceivingItemUncheckedCreateInput, tx: Prisma.TransactionClient) {
    return tx.supplierReceivingItem.create({ data });
  }
  static findById(id: string, tx?: Prisma.TransactionClient) {
    return (tx ?? prisma).supplierReceiving.findUnique({ where: { id }, include: detailInclude });
  }
  /** The correction paths read only what they may act on: metadata, status, and the lines to reverse. */
  static findForCorrection(id: string, tx: Prisma.TransactionClient) {
    return tx.supplierReceiving.findUnique({
      where: { id },
      select: {
        id: true, referenceNumber: true, note: true, receivedOn: true, status: true,
        supplier: { select: { id: true, name: true } },
        items: {
          select: { id: true, productId: true, quantity: true, status: true, stockMovementId: true },
          orderBy: [{ productId: 'asc' }, { id: 'asc' }],
        },
        transactions: { select: { id: true, status: true }, take: 1 },
      },
    });
  }
  static updateMetadata(id: string, data: { referenceNumber: string | null; note: string | null }, tx: Prisma.TransactionClient) {
    // Scoped to POSTED so a document voided by a concurrent request is never
    // silently edited afterwards; `count !== 1` is the caller's conflict signal.
    return tx.supplierReceiving.updateMany({
      where: { id, status: SupplierReceivingStatus.POSTED },
      data,
    });
  }
  static markVoided(id: string, data: { voidedAt: Date; voidedById: string; voidReason: string }, tx: Prisma.TransactionClient) {
    return tx.supplierReceiving.updateMany({
      where: { id, status: SupplierReceivingStatus.POSTED },
      data: { ...data, status: SupplierReceivingStatus.VOIDED },
    });
  }
  static reverseItem(
    itemId: string,
    data: { reversalStockMovementId: string; reversedAt: Date; reversedById: string; reversalReason: string },
    tx: Prisma.TransactionClient
  ) {
    return tx.supplierReceivingItem.updateMany({
      where: { id: itemId, status: SupplierReceivingItemStatus.ACTIVE },
      data: { ...data, status: SupplierReceivingItemStatus.REVERSED },
    });
  }
  static createAudit(data: Prisma.SupplierReceivingAuditUncheckedCreateInput, tx: Prisma.TransactionClient) {
    return tx.supplierReceivingAudit.create({ data });
  }
  static findActor(userId: string, tx: Prisma.TransactionClient) {
    return tx.user.findUnique({ where: { id: userId }, select: { fullName: true, username: true } });
  }
  static findDuplicate(supplierId: string, referenceNumber: string) {
    return prisma.supplierReceiving.findFirst({
      where: { supplierId, referenceNumber: { equals: referenceNumber, mode: 'insensitive' } },
      include: listInclude,
      orderBy: [{ receivedOn: 'desc' }, { createdAt: 'desc' }],
    });
  }
  static async list(input: { page: number; pageSize: number; supplierId?: string; referenceNumber?: string }) {
    const where: Prisma.SupplierReceivingWhereInput = {
      ...(input.supplierId ? { supplierId: input.supplierId } : {}),
      ...(input.referenceNumber ? { referenceNumber: { contains: input.referenceNumber, mode: 'insensitive' } } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.supplierReceiving.findMany({ where, include: listInclude, orderBy: [{ receivedOn: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }], skip: (input.page - 1) * input.pageSize, take: input.pageSize }),
      prisma.supplierReceiving.count({ where }),
    ]);
    return { items, total, page: input.page, pageSize: input.pageSize };
  }
}
