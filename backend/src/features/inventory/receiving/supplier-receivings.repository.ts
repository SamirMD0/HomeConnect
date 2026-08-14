import { Prisma } from '@prisma/client';
import { prisma } from '../../../lib/prisma';

const listInclude = {
  supplier: { select: { id: true, name: true, isActive: true } },
  receivedBy: { select: { id: true, fullName: true, username: true } },
  _count: { select: { items: true } },
} satisfies Prisma.SupplierReceivingInclude;

const detailInclude = {
  supplier: { select: { id: true, name: true, isActive: true } },
  receivedBy: { select: { id: true, fullName: true, username: true } },
  items: {
    include: {
      product: { select: { id: true, sku: true, name: true, stockQuantity: true } },
      stockMovement: true,
    },
    orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }],
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
