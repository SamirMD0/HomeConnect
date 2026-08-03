import { Prisma, SalesAuditAction, SalesAuditRecordType } from '@prisma/client';
import { prisma } from '../../../lib/prisma';

export interface CreateSalesAuditData {
  recordType: SalesAuditRecordType;
  recordId: string;
  salesOrderId?: string | null;
  action: SalesAuditAction;
  changedById: string;
  changedByName: string;
  changedByUsername: string;
  reason: string;
  beforeValues: Prisma.InputJsonObject;
  afterValues: Prisma.InputJsonObject;
  requestId?: string | null;
  ipAddress?: string | null;
}

export class SalesAuditRepository {
  static create(data: CreateSalesAuditData, tx: Prisma.TransactionClient) {
    return tx.salesAudit.create({ data });
  }

  static list(orderId: string, skip = 0, take = 50) {
    return prisma.salesAudit.findMany({
      where: { salesOrderId: orderId },
      orderBy: [{ changedAt: 'desc' }, { id: 'asc' }],
      skip,
      take,
    });
  }
}
