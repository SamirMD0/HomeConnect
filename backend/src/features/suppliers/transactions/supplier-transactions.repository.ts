import { Prisma, SupplierTransactionStatus } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { findSearchMatchIds } from '../../../lib/search-query';
import { SupplierLedgerQueryInput } from './supplier-transactions.validator';

export const supplierTransactionInclude = {
  supplier: { select: { id: true, name: true, phone: true, companyName: true, isActive: true } },
  createdBy: { select: { id: true, fullName: true, username: true } },
  updatedBy: { select: { id: true, fullName: true, username: true } },
  removedBy: { select: { id: true, fullName: true, username: true } },
  supplierReceiving: {
    select: {
      id: true, referenceNumber: true, receivedOn: true,
      items: { select: { quantity: true, product: { select: { id: true, name: true, sku: true } } }, orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }] },
    },
  },
} satisfies Prisma.SupplierTransactionInclude;

export interface SupplierSearchMatch {
  transactionIds: string[];
  supplierIds: string[];
}

/**
 * Resolves a supplier-ledger search term to matching transaction and supplier
 * ids. Returns null when there is no term, meaning "apply no search filter".
 */
export async function resolveSupplierSearch(search?: string): Promise<SupplierSearchMatch | null> {
  if (!search?.trim()) return null;
  const [transactionIds, supplierIds] = await Promise.all([
    findSearchMatchIds('supplierTransaction', search),
    findSearchMatchIds('supplier', search),
  ]);
  return { transactionIds: transactionIds ?? [], supplierIds: supplierIds ?? [] };
}

export function supplierTransactionWhere(
  query: Partial<SupplierLedgerQueryInput> & { supplierId?: string; searchMatch?: SupplierSearchMatch | null }
): Prisma.SupplierTransactionWhereInput {
  return {
    ...(query.supplierId ? { supplierId: query.supplierId } : {}),
    ...(query.type ? { type: query.type } : {}), ...(query.direction ? { direction: query.direction } : {}),
    ...(!query.includeRemoved ? { status: SupplierTransactionStatus.ACTIVE } : {}),
    ...(query.dateFrom || query.dateTo ? { transactionDate: { ...(query.dateFrom ? { gte: new Date(`${query.dateFrom}T00:00:00.000Z`) } : {}), ...(query.dateTo ? { lte: new Date(`${query.dateTo}T00:00:00.000Z`) } : {}) } } : {}),
    // Search is resolved to ids up-front by resolveSupplierSearch() and passed
    // in as searchMatch, so this stays a pure synchronous where-builder.
    ...(query.searchMatch ? { OR: [
      { id: { in: query.searchMatch.transactionIds } },
      { supplierId: { in: query.searchMatch.supplierIds } },
    ] } : {}),
  };
}

export class SupplierTransactionsRepository {
  static findById(id: string, tx?: Prisma.TransactionClient) { return (tx ?? prisma).supplierTransaction.findUnique({ where: { id }, include: supplierTransactionInclude }); }
  static create(data: Prisma.SupplierTransactionUncheckedCreateInput, tx: Prisma.TransactionClient) { return tx.supplierTransaction.create({ data, include: supplierTransactionInclude }); }
  static findReceiving(id: string, tx: Prisma.TransactionClient) {
    return tx.supplierReceiving.findUnique({ where: { id }, select: { id: true, supplierId: true } });
  }
  static findByReceivingId(supplierReceivingId: string, tx: Prisma.TransactionClient) {
    return tx.supplierTransaction.findUnique({ where: { supplierReceivingId }, select: { id: true } });
  }
  static update(id: string, data: Prisma.SupplierTransactionUncheckedUpdateInput, tx: Prisma.TransactionClient) { return tx.supplierTransaction.update({ where: { id }, data, include: supplierTransactionInclude }); }
  static async list(query: SupplierLedgerQueryInput, supplierId?: string) {
    const searchMatch = await resolveSupplierSearch(query.search);
    const where = supplierTransactionWhere({ ...query, supplierId, searchMatch });
    const orderBy: Prisma.SupplierTransactionOrderByWithRelationInput[] = query.sortBy === 'supplier'
      ? [{ supplier: { name: query.sortOrder } }, { transactionDate: 'desc' }, { id: 'asc' }]
      : [{ [query.sortBy]: query.sortOrder }, { createdAt: 'desc' }, { id: 'asc' }];
    const [items, total] = await Promise.all([
      prisma.supplierTransaction.findMany({ where, include: supplierTransactionInclude, skip: (query.page - 1) * query.pageSize, take: query.pageSize, orderBy }),
      prisma.supplierTransaction.count({ where }),
    ]);
    return { items, total, where };
  }
  static summaryRows(where: Prisma.SupplierTransactionWhereInput, tx?: Prisma.TransactionClient) { return (tx ?? prisma).supplierTransaction.groupBy({ by: ['type','direction'], where, _sum: { amount: true }, _count: { _all: true } }); }
  static supplierCount(where: Prisma.SupplierTransactionWhereInput) { return prisma.supplierTransaction.findMany({ where, distinct: ['supplierId'], select: { supplierId: true } }).then((r) => r.length); }
}
