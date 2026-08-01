import { Prisma, SupplierAuditAction, SupplierAuditRecordType } from '@prisma/client';
import { prisma } from '../../../lib/prisma';

export interface CreateSupplierAuditData {
  recordType: SupplierAuditRecordType;
  recordId: string;
  supplierId?: string | null;
  supplierTransactionId?: string | null;
  action: SupplierAuditAction;
  changedById: string;
  changedByName: string;
  changedByUsername: string;
  reason: string;
  beforeValues: Prisma.InputJsonObject;
  afterValues: Prisma.InputJsonObject;
  affectedTotals?: Prisma.InputJsonObject;
  requestId?: string | null;
  ipAddress?: string | null;
}

export class SupplierAuditRepository {
  static create(data: CreateSupplierAuditData, tx?: Prisma.TransactionClient) {
    return (tx ?? prisma).supplierAudit.create({ data });
  }
  static async list(supplierId: string, skip: number, take: number) {
    const where: Prisma.SupplierAuditWhereInput = { supplierId };
    const [items, total] = await Promise.all([
      prisma.supplierAudit.findMany({ where, orderBy: [{ changedAt: 'desc' }, { id: 'asc' }], skip, take }),
      prisma.supplierAudit.count({ where }),
    ]);
    return { items, total };
  }
}
