import { NotFoundError } from '../../../lib/errors';
import { scopeWhere, type BranchScope } from '../../branches/branch-scope';
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
  /** API calls supply scope; the legacy activity loader is restricted by its customer parent. */
  scope?: BranchScope;
  recordType?: FinancialCorrectionRecordType;
  recordId?: string;
  customerId?: string;
  from?: Date;
  to?: Date;
}

export class CorrectionAuditRepository {
  static async createCorrectionAudit(
    data: CreateCorrectionAuditData,
    tx?: FinancialTransactionClient
  ) {
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
    // Audit rows inherit ownership through their polymorphic source record,
    // including counter receipts whose customerId is null.
    const scope = params.scope ?? (await this.scopeForCustomerActivity(params.customerId));
    const [prepaids, customers, debts, plans, payments, installments] = await Promise.all([
      prisma.prepaidPurchase.findMany({
        where: { debt: scopeWhere(scope) },
        select: { id: true, debt: { select: { branchId: true } } },
      }),
      prisma.customer.findMany({ where: scopeWhere(scope), select: { id: true, branchId: true } }),
      prisma.debt.findMany({ where: scopeWhere(scope), select: { id: true, branchId: true } }),
      prisma.installmentPlan.findMany({
        where: scopeWhere(scope),
        select: { id: true, branchId: true },
      }),
      prisma.payment.findMany({ where: scopeWhere(scope), select: { id: true, branchId: true } }),
      prisma.installment.findMany({
        where: { installmentPlan: scopeWhere(scope) },
        select: { id: true, installmentPlan: { select: { branchId: true } } },
      }),
    ]);
    const debtBranches = new Map(debts.map((row) => [row.id, row.branchId]));
    const planBranches = new Map(plans.map((row) => [row.id, row.branchId]));
    const paymentBranches = new Map(payments.map((row) => [row.id, row.branchId]));
    const branches = {
      PREPAID_PURCHASE: new Map(prepaids.map((row) => [row.id, row.debt.branchId])),
      CUSTOMER_BILLING: new Map(customers.map((row) => [row.id, row.branchId])),
      INSTALLMENT: new Map(installments.map((row) => [row.id, row.installmentPlan.branchId])),
      DEBT: debtBranches,
      INSTALLMENT_PLAN: planBranches,
      PAYMENT: paymentBranches,
      PAYMENT_ALLOCATION: paymentBranches,
    };
    const rows = await prisma.financialCorrectionAudit.findMany({
      where: {
        OR: [
          { recordType: 'PREPAID_PURCHASE', recordId: { in: prepaids.map((row) => row.id) } },
          { recordType: 'CUSTOMER_BILLING', recordId: { in: customers.map((row) => row.id) } },
          { recordType: 'DEBT', recordId: { in: debts.map((row) => row.id) } },
          { recordType: 'INSTALLMENT_PLAN', recordId: { in: plans.map((row) => row.id) } },
          { recordType: 'INSTALLMENT', recordId: { in: installments.map((row) => row.id) } },
          {
            recordType: { in: ['PAYMENT', 'PAYMENT_ALLOCATION'] },
            recordId: { in: payments.map((row) => row.id) },
          },
        ],
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
    return rows.map((row) => ({ ...row, branchId: branches[row.recordType].get(row.recordId)! }));
  }
  private static async scopeForCustomerActivity(customerId?: string): Promise<BranchScope> {
    if (!customerId)
      throw new Error('Correction audit reads require a branch scope or customer parent');
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { branchId: true },
    });
    if (!customer) throw new NotFoundError('Customer not found');
    return { mode: 'single', branchIds: [customer.branchId] };
  }
}
