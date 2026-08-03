import {
  DebtKind,
  DebtStatus,
  FinancialCorrectionRecordType,
  InstallmentPlanStatus,
  Prisma,
} from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { findSearchMatchIds } from '../../../lib/search-query';

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
  salesOrder: {
    select: {
      paymentStatus: true,
      paidAmount: true,
    },
  },
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
    const customerWhere = this.customerWhere();
    const searchIds = await this.resolveSearchIds(params);
    // Customer name/phone as before, now also the obligation description.
    const debtSearchWhere: Prisma.DebtWhereInput = searchIds
      ? {
          OR: [
            { customerId: { in: searchIds.customerIds } },
            { id: { in: searchIds.debtIds } },
          ],
        }
      : {};
    // Plans and payments have no description of their own in the ledger, so they
    // keep matching on the customer only.
    const customerSearchWhere = searchIds
      ? { customerId: { in: searchIds.customerIds } }
      : {};

    const debtWhere: Prisma.DebtWhereInput = {
      ...customerWhere,
      ...debtSearchWhere,
      ...(params.customerId ? { customerId: params.customerId } : {}),
      // Prepaid purchases have their own section. Excluding them here (rather than
      // when mapping) keeps the ledger's pagination totals correct.
      kind: DebtKind.STANDARD,
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
      ...customerSearchWhere,
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
      ...customerSearchWhere,
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

  /** Live-customer scope. Applied to every ledger record type, search or not. */
  private static customerWhere() {
    return { customer: { deletedAt: null } } satisfies Pick<Prisma.DebtWhereInput, 'customer'>;
  }

  /**
   * Resolves the ledger search term to matching customer ids and debt ids.
   * Returns null when there is no search, meaning "apply no search filter".
   */
  private static async resolveSearchIds(params: LoadFinancialLedgerParams) {
    const search = params.search?.trim();
    if (!search) return null;

    const [customerIds, debtIds] = await Promise.all([
      findSearchMatchIds('customer', search),
      findSearchMatchIds('debt', search),
    ]);

    return { customerIds: customerIds ?? [], debtIds: debtIds ?? [] };
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
