import {
  DebtStatus,
  FinancialCorrectionRecordType,
  InstallmentPlanStatus,
  Prisma,
} from '@prisma/client';
import { prisma } from '../../../lib/prisma';

const customerSelect = {
  id: true,
  name: true,
  phone: true,
} satisfies Prisma.CustomerSelect;

const paymentAllocationPaymentSelect = {
  id: true,
  voidedAt: true,
} satisfies Prisma.PaymentSelect;

const debtInclude = {
  customer: { select: customerSelect },
  paymentAllocations: {
    include: {
      payment: {
        select: paymentAllocationPaymentSelect,
      },
    },
    orderBy: { createdAt: 'asc' },
  },
} satisfies Prisma.DebtInclude;

const planInclude = {
  customer: { select: customerSelect },
  installments: {
    include: {
      paymentAllocations: {
        include: {
          payment: {
            select: paymentAllocationPaymentSelect,
          },
        },
        orderBy: { createdAt: 'asc' },
      },
    },
    orderBy: { installmentNumber: 'asc' },
  },
} satisfies Prisma.InstallmentPlanInclude;

const paymentInclude = {
  customer: { select: customerSelect },
  allocations: {
    include: {
      debt: {
        select: {
          id: true,
          description: true,
        },
      },
      installment: {
        select: {
          id: true,
          installmentPlanId: true,
          installmentPlan: {
            select: {
              id: true,
              description: true,
            },
          },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  },
} satisfies Prisma.PaymentInclude;

export type FinancialLedgerDebtRecord = Prisma.DebtGetPayload<{ include: typeof debtInclude }>;
export type FinancialLedgerPlanRecord = Prisma.InstallmentPlanGetPayload<{ include: typeof planInclude }>;
export type FinancialLedgerPaymentRecord = Prisma.PaymentGetPayload<{ include: typeof paymentInclude }>;

export interface LoadFinancialLedgerParams {
  customerId?: string;
  search?: string;
  dueFrom?: Date;
  dueTo?: Date;
  paymentFrom?: Date;
  paymentTo?: Date;
  includeCancelled: boolean;
  includeDebts: boolean;
  includePlans: boolean;
  includePayments: boolean;
}

export interface FinancialLedgerRecordSet {
  debts: FinancialLedgerDebtRecord[];
  plans: FinancialLedgerPlanRecord[];
  payments: FinancialLedgerPaymentRecord[];
}

export interface FinancialLedgerCorrectionMarker {
  hasCorrections: boolean;
  correctionCount: number;
  lastCorrectedAt: Date | null;
}

export interface FinancialLedgerCorrectionMarkers {
  debts: Map<string, FinancialLedgerCorrectionMarker>;
  plans: Map<string, FinancialLedgerCorrectionMarker>;
  payments: Map<string, FinancialLedgerCorrectionMarker>;
}

export class FinancialLedgerRepository {
  static async loadFinancialLedger(params: LoadFinancialLedgerParams): Promise<FinancialLedgerRecordSet> {
    const customerWhere = this.customerWhere(params);
    const debtWhere: Prisma.DebtWhereInput = {
      ...customerWhere,
      ...(params.customerId ? { customerId: params.customerId } : {}),
      ...(!params.includeCancelled ? { status: { not: DebtStatus.CANCELLED } } : {}),
      ...(params.dueFrom || params.dueTo
        ? {
            dueDate: {
              ...(params.dueFrom ? { gte: params.dueFrom } : {}),
              ...(params.dueTo ? { lte: params.dueTo } : {}),
            },
          }
        : {}),
    };
    const planWhere: Prisma.InstallmentPlanWhereInput = {
      ...customerWhere,
      ...(params.customerId ? { customerId: params.customerId } : {}),
      ...(!params.includeCancelled ? { status: { not: InstallmentPlanStatus.CANCELLED } } : {}),
      ...(params.dueFrom || params.dueTo
        ? {
            installments: {
              some: {
                dueDate: {
                  ...(params.dueFrom ? { gte: params.dueFrom } : {}),
                  ...(params.dueTo ? { lte: params.dueTo } : {}),
                },
              },
            },
          }
        : {}),
    };
    const paymentWhere: Prisma.PaymentWhereInput = {
      ...customerWhere,
      ...(params.customerId ? { customerId: params.customerId } : {}),
      ...(!params.includeCancelled ? { voidedAt: null } : {}),
      ...(params.paymentFrom || params.paymentTo
        ? {
            paymentDate: {
              ...(params.paymentFrom ? { gte: params.paymentFrom } : {}),
              ...(params.paymentTo ? { lte: params.paymentTo } : {}),
            },
          }
        : {}),
    };
    const [debts, plans, payments] = await Promise.all([
      params.includeDebts
        ? prisma.debt.findMany({
            where: debtWhere,
            include: debtInclude,
            orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
          })
        : Promise.resolve([]),
      params.includePlans
        ? prisma.installmentPlan.findMany({
            where: planWhere,
            include: planInclude,
            orderBy: [{ startDate: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
          })
        : Promise.resolve([]),
      params.includePayments
        ? prisma.payment.findMany({
            where: paymentWhere,
            include: paymentInclude,
            orderBy: [{ paymentDate: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
          })
        : Promise.resolve([]),
    ]);

    return {
      debts,
      plans,
      payments,
    };
  }

  static async loadCorrectionMarkers(params: {
    debtIds: string[];
    planIds: string[];
    paymentIds: string[];
  }): Promise<FinancialLedgerCorrectionMarkers> {
    const markers: FinancialLedgerCorrectionMarkers = {
      debts: new Map(),
      plans: new Map(),
      payments: new Map(),
    };
    const clauses: Prisma.FinancialCorrectionAuditWhereInput[] = [];

    if (params.debtIds.length > 0) {
      clauses.push({
        recordType: FinancialCorrectionRecordType.DEBT,
        recordId: { in: params.debtIds },
      });
    }
    if (params.planIds.length > 0) {
      clauses.push({
        recordType: FinancialCorrectionRecordType.INSTALLMENT_PLAN,
        recordId: { in: params.planIds },
      });
    }
    if (params.paymentIds.length > 0) {
      clauses.push({
        recordType: {
          in: [FinancialCorrectionRecordType.PAYMENT, FinancialCorrectionRecordType.PAYMENT_ALLOCATION],
        },
        recordId: { in: params.paymentIds },
      });
    }

    if (clauses.length === 0) return markers;

    const audits = await prisma.financialCorrectionAudit.findMany({
      where: { OR: clauses },
      select: {
        recordType: true,
        recordId: true,
        correctedAt: true,
      },
      orderBy: { correctedAt: 'desc' },
    });

    for (const audit of audits) {
      const targetMap = this.correctionMapForRecordType(markers, audit.recordType);
      const existing = targetMap.get(audit.recordId) ?? {
        hasCorrections: true,
        correctionCount: 0,
        lastCorrectedAt: null,
      };

      existing.correctionCount += 1;
      if (!existing.lastCorrectedAt || audit.correctedAt > existing.lastCorrectedAt) {
        existing.lastCorrectedAt = audit.correctedAt;
      }
      targetMap.set(audit.recordId, existing);
    }

    return markers;
  }

  private static customerWhere(params: LoadFinancialLedgerParams) {
    const search = params.search?.trim();

    return {
      customer: {
        deletedAt: null,
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: Prisma.QueryMode.insensitive } },
                { phone: { contains: search, mode: Prisma.QueryMode.insensitive } },
              ],
            }
          : {}),
      },
    } satisfies Pick<Prisma.DebtWhereInput, 'customer'>;
  }

  private static correctionMapForRecordType(
    markers: FinancialLedgerCorrectionMarkers,
    recordType: FinancialCorrectionRecordType
  ): Map<string, FinancialLedgerCorrectionMarker> {
    if (recordType === FinancialCorrectionRecordType.DEBT) return markers.debts;
    if (recordType === FinancialCorrectionRecordType.INSTALLMENT_PLAN) return markers.plans;
    return markers.payments;
  }
}
