import { DebtKind, DebtStatus, InstallmentPlanStatus, Prisma } from '@prisma/client';
import { businessDateToPrisma } from '../../financial';
import { prisma } from '../../../lib/prisma';
import { addDays } from '../shared/dashboard-range';
import type { ResolvedDashboardRange } from '../dashboard.types';

const allocationInclude = {
  include: { payment: { select: { voidedAt: true, paymentDate: true } } },
} satisfies Prisma.PaymentAllocationFindManyArgs;

const debtInclude = {
  customer: { select: { id: true, name: true, phone: true } },
  paymentAllocations: allocationInclude,
} satisfies Prisma.DebtInclude;

const planInclude = {
  customer: { select: { id: true, name: true, phone: true } },
  installments: {
    include: { paymentAllocations: allocationInclude },
    orderBy: { installmentNumber: 'asc' as const },
  },
} satisfies Prisma.InstallmentPlanInclude;

export type CustomerAnalyticsDebt = Prisma.DebtGetPayload<{ include: typeof debtInclude }>;
export type CustomerAnalyticsPlan = Prisma.InstallmentPlanGetPayload<{ include: typeof planInclude }>;
export type CustomerAnalyticsPayment = Prisma.PaymentGetPayload<{
  include: { customer: { select: { id: true; name: true; phone: true } } };
}>;

export interface CustomerAnalyticsRecords {
  totalCustomers: number;
  debts: CustomerAnalyticsDebt[];
  plans: CustomerAnalyticsPlan[];
  payments: CustomerAnalyticsPayment[];
}

export class CustomerAnalyticsRepository {
  static async load(
    range: ResolvedDashboardRange,
    historyFrom: string,
    includeArchived: boolean
  ): Promise<CustomerAnalyticsRecords> {
    const customerWhere = includeArchived ? { deletedAt: null } : { deletedAt: null, isActive: true };
    const historyDate = businessDateToPrisma(historyFrom);
    const historyEnd = businessDateToPrisma(addDays(range.to, 1));

    const [totalCustomers, openDebts, rangeDebts, openPlans, rangePlans, payments] =
      await Promise.all([
        prisma.customer.count({ where: customerWhere }),
        prisma.debt.findMany({
          where: {
            customer: customerWhere,
            kind: DebtKind.STANDARD,
            status: { notIn: [DebtStatus.PAID, DebtStatus.CANCELLED] },
            cancelledAt: null,
          },
          include: debtInclude,
        }),
        prisma.debt.findMany({
          where: {
            customer: customerWhere,
            kind: DebtKind.STANDARD,
            createdAt: { gte: historyDate, lt: historyEnd },
          },
          include: debtInclude,
        }),
        prisma.installmentPlan.findMany({
          where: {
            customer: customerWhere,
            status: { notIn: [InstallmentPlanStatus.COMPLETED, InstallmentPlanStatus.CANCELLED] },
            cancelledAt: null,
          },
          include: planInclude,
        }),
        prisma.installmentPlan.findMany({
          where: {
            customer: customerWhere,
            createdAt: { gte: historyDate, lt: historyEnd },
          },
          include: planInclude,
        }),
        prisma.payment.findMany({
          where: {
            customer: customerWhere,
            voidedAt: null,
            paymentDate: { gte: historyDate, lt: historyEnd },
          },
          include: { customer: { select: { id: true, name: true, phone: true } } },
        }),
      ]);

    return {
      totalCustomers,
      debts: dedupeById([...openDebts, ...rangeDebts]),
      plans: dedupeById([...openPlans, ...rangePlans]),
      payments,
    };
  }
}

function dedupeById<T extends { id: string }>(records: T[]): T[] {
  return [...new Map(records.map((record) => [record.id, record])).values()];
}

