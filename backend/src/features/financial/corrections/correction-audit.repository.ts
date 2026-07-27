import { Prisma } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { FinancialTransactionClient } from '../infrastructure/transaction';
import {
  FinancialCorrectionAction,
  FinancialCorrectionRecordType,
  FinancialCorrectionSourceScreen,
} from './corrections.validator';

export interface CreateCorrectionAuditData {
  recordType: FinancialCorrectionRecordType;
  recordId: string;
  customerId?: string | null;
  action: FinancialCorrectionAction;
  correctedById: string;
  correctedByName: string;
  correctedByUsername: string;
  correctedAt?: Date;
  reason: string;
  beforeValues: Prisma.InputJsonValue;
  afterValues: Prisma.InputJsonValue;
  affectedTotals?: Prisma.InputJsonValue | null;
  sourceScreen: FinancialCorrectionSourceScreen;
  requestId?: string | null;
  ipAddress?: string | null;
}

export interface ListCorrectionAuditParams {
  recordType?: FinancialCorrectionRecordType;
  recordId?: string;
  customerId?: string;
  from?: Date;
  to?: Date;
}

export class CorrectionAuditRepository {
  static async createCorrectionAudit(data: CreateCorrectionAuditData, tx?: FinancialTransactionClient) {
    const client = tx ?? prisma;
    return client.financialCorrectionAudit.create({
      data: {
        recordType: data.recordType,
        recordId: data.recordId,
        customerId: data.customerId ?? null,
        action: data.action,
        correctedById: data.correctedById,
        correctedByName: data.correctedByName,
        correctedByUsername: data.correctedByUsername,
        correctedAt: data.correctedAt ?? new Date(),
        reason: data.reason,
        beforeValues: data.beforeValues,
        afterValues: data.afterValues,
        affectedTotals: data.affectedTotals ?? undefined,
        sourceScreen: data.sourceScreen,
        requestId: data.requestId ?? null,
        ipAddress: data.ipAddress ?? null,
      },
    });
  }

  static async listCorrectionAudits(params: ListCorrectionAuditParams) {
    return prisma.financialCorrectionAudit.findMany({
      where: {
        ...(params.recordType ? { recordType: params.recordType } : {}),
        ...(params.recordId ? { recordId: params.recordId } : {}),
        ...(params.customerId ? { customerId: params.customerId } : {}),
        ...(params.from || params.to
          ? {
              correctedAt: {
                ...(params.from ? { gte: params.from } : {}),
                ...(params.to ? { lte: params.to } : {}),
              },
            }
          : {}),
      },
      orderBy: [{ correctedAt: 'desc' }, { id: 'asc' }],
    });
  }
}
