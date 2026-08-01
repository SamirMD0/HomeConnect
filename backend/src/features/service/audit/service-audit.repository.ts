import { Prisma, ServiceAuditAction, ServiceAuditRecordType } from '@prisma/client';
import { prisma } from '../../../lib/prisma';

export interface CreateServiceAuditData {
  recordType: ServiceAuditRecordType;
  recordId: string;
  serviceJobId?: string | null;
  action: ServiceAuditAction;
  changedById: string;
  changedByName: string;
  changedByUsername: string;
  reason: string;
  beforeValues: Prisma.InputJsonObject;
  afterValues: Prisma.InputJsonObject;
  requestId?: string | null;
  ipAddress?: string | null;
}

export class ServiceAuditRepository {
  static create(data: CreateServiceAuditData, tx?: Prisma.TransactionClient) {
    return (tx ?? prisma).serviceAudit.create({ data });
  }

  static list(recordType: ServiceAuditRecordType, recordId: string, skip = 0, take = 50) {
    return prisma.serviceAudit.findMany({
      where: { recordType, recordId },
      orderBy: [{ changedAt: 'desc' }, { id: 'asc' }],
      skip,
      take,
    });
  }
}
