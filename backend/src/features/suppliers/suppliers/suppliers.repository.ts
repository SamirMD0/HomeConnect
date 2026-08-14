import { Prisma, SupplierTransactionDirection, SupplierTransactionStatus } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { findSearchMatchIds } from '../../../lib/search-query';

export const supplierInclude = {
  createdBy: { select: { id: true, fullName: true, username: true } },
  updatedBy: { select: { id: true, fullName: true, username: true } },
} satisfies Prisma.SupplierInclude;

export class SuppliersRepository {
  static findById(id: string, tx?: Prisma.TransactionClient) {
    return (tx ?? prisma).supplier.findUnique({ where: { id }, include: supplierInclude });
  }
  static async list(params: { search?: string; isActive?: boolean; sortBy: 'name'|'createdAt'|'balance'; sortOrder: 'asc'|'desc'; skip: number; take: number }) {
    const matchedIds = await findSearchMatchIds('supplier', params.search);
    const where: Prisma.SupplierWhereInput = {
      ...(params.isActive === undefined ? {} : { isActive: params.isActive }),
      ...(matchedIds ? { id: { in: matchedIds } } : {}),
    };
    const orderField = params.sortBy === 'balance' ? 'name' : params.sortBy;
    const [items, total] = await Promise.all([
      prisma.supplier.findMany({ where, include: supplierInclude, skip: params.skip, take: params.take, orderBy: [{ [orderField]: params.sortOrder }, { id: 'asc' }] }),
      prisma.supplier.count({ where }),
    ]);
    return { items, total };
  }
  static async listAllForBalance(params: { search?: string; isActive?: boolean }) {
    const matchedIds = await findSearchMatchIds('supplier', params.search);
    const where: Prisma.SupplierWhereInput = {
      ...(params.isActive === undefined ? {} : { isActive: params.isActive }),
      ...(matchedIds ? { id: { in: matchedIds } } : {}),
    };
    return prisma.supplier.findMany({ where, include: supplierInclude, orderBy: [{ name: 'asc' }, { id: 'asc' }] });
  }
  static create(data: Prisma.SupplierUncheckedCreateInput, tx: Prisma.TransactionClient) { return tx.supplier.create({ data, include: supplierInclude }); }
  static update(id: string, data: Prisma.SupplierUncheckedUpdateInput, tx: Prisma.TransactionClient) { return tx.supplier.update({ where: { id }, data, include: supplierInclude }); }
  static transactionCount(id: string, tx: Prisma.TransactionClient) { return tx.supplierTransaction.count({ where: { supplierId: id } }); }
  static receivingCount(id: string, tx: Prisma.TransactionClient) { return tx.supplierReceiving.count({ where: { supplierId: id } }); }
  static deleteAudits(id: string, tx: Prisma.TransactionClient) { return tx.supplierAudit.deleteMany({ where: { supplierId: id } }); }
  static delete(id: string, tx: Prisma.TransactionClient) { return tx.supplier.delete({ where: { id } }); }
  static async balances(supplierIds: string[], tx?: Prisma.TransactionClient) {
    if (supplierIds.length === 0) return new Map<string, { increase: string; decrease: string }>();
    const rows = await (tx ?? prisma).supplierTransaction.groupBy({
      by: ['supplierId', 'direction'],
      where: { supplierId: { in: supplierIds }, status: SupplierTransactionStatus.ACTIVE },
      _sum: { amount: true },
    });
    const result = new Map<string, { increase: string; decrease: string }>();
    for (const row of rows) {
      const current = result.get(row.supplierId) ?? { increase: '0.00', decrease: '0.00' };
      const amount = row._sum.amount?.toString() ?? '0.00';
      if (row.direction === SupplierTransactionDirection.INCREASE_OWED) current.increase = amount;
      else current.decrease = amount;
      result.set(row.supplierId, current);
    }
    return result;
  }
  static summaryRows(supplierId: string, tx?: Prisma.TransactionClient) {
    return (tx ?? prisma).supplierTransaction.groupBy({
      by: ['type', 'direction'],
      where: { supplierId, status: SupplierTransactionStatus.ACTIVE },
      _sum: { amount: true }, _count: { _all: true },
    });
  }
}
