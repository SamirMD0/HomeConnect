import { Prisma } from '@prisma/client';
import { prisma } from '../../../lib/prisma';

const customerSelect = {
  id: true,
  name: true,
  phone: true,
} satisfies Prisma.CustomerSelect;

const allocationPaymentSelect = {
  id: true,
  paymentDate: true,
  totalAmount: true,
  voidedAt: true,
} satisfies Prisma.PaymentSelect;

const debtInclude = {
  customer: { select: customerSelect },
  paymentAllocations: {
    include: {
      payment: { select: allocationPaymentSelect },
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
          payment: { select: allocationPaymentSelect },
        },
        orderBy: { createdAt: 'asc' },
      },
    },
    orderBy: { installmentNumber: 'asc' },
  },
} satisfies Prisma.InstallmentPlanInclude;

const activityDebtSelect = {
  id: true,
  customer: { select: customerSelect },
  description: true,
  originalAmount: true,
  createdAt: true,
} satisfies Prisma.DebtSelect;

const activityPlanSelect = {
  id: true,
  customer: { select: customerSelect },
  description: true,
  totalAmount: true,
  createdAt: true,
} satisfies Prisma.InstallmentPlanSelect;

const activityPaymentSelect = {
  id: true,
  customer: { select: customerSelect },
  totalAmount: true,
  paymentDate: true,
  voidedAt: true,
  reference: true,
} satisfies Prisma.PaymentSelect;

export type MonthlyDebtRecord = Prisma.DebtGetPayload<{ include: typeof debtInclude }>;
export type MonthlyInstallmentPlanRecord = Prisma.InstallmentPlanGetPayload<{ include: typeof planInclude }>;
export type MonthlyActivityDebtRecord = Prisma.DebtGetPayload<{ select: typeof activityDebtSelect }>;
export type MonthlyActivityPlanRecord = Prisma.InstallmentPlanGetPayload<{ select: typeof activityPlanSelect }>;
export type MonthlyActivityPaymentRecord = Prisma.PaymentGetPayload<{ select: typeof activityPaymentSelect }>;
export type MonthlyPaymentRecord = Prisma.PaymentGetPayload<{ select: typeof activityPaymentSelect }>;

export interface MonthlyDebtSnapshotRecordSet {
  debts: MonthlyDebtRecord[];
  plans: MonthlyInstallmentPlanRecord[];
  paymentsThroughCutoff: MonthlyPaymentRecord[];
  monthlyPayments: MonthlyPaymentRecord[];
}

export interface LoadMonthlyDebtSnapshotParams {
  search?: string;
  startDate: Date;
  cutoffDate: Date;
  nextDayAfterCutoff: Date;
}

export interface MonthlyFinancialActivityRecordSet {
  debts: MonthlyActivityDebtRecord[];
  plans: MonthlyActivityPlanRecord[];
  payments: MonthlyActivityPaymentRecord[];
}

export interface LoadMonthlyFinancialActivityParams {
  customerId?: string;
  startDate: Date;
  endDate: Date;
  nextDayAfterEnd: Date;
}

export class MonthlyDebtsRepository {
  static async loadSnapshotRecords(
    params: LoadMonthlyDebtSnapshotParams
  ): Promise<MonthlyDebtSnapshotRecordSet> {
    const customerWhere = this.customerWhere(params.search);

    const [debts, plans, paymentsThroughCutoff, monthlyPayments] = await Promise.all([
      prisma.debt.findMany({
        where: {
          ...customerWhere,
          createdAt: { lt: params.nextDayAfterCutoff },
        },
        include: debtInclude,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      }),
      prisma.installmentPlan.findMany({
        where: {
          ...customerWhere,
          createdAt: { lt: params.nextDayAfterCutoff },
        },
        include: planInclude,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      }),
      prisma.payment.findMany({
        where: {
          ...customerWhere,
          paymentDate: { lte: params.cutoffDate },
        },
        select: activityPaymentSelect,
        orderBy: [{ paymentDate: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
      }),
      prisma.payment.findMany({
        where: {
          ...customerWhere,
          paymentDate: { gte: params.startDate, lte: params.cutoffDate },
        },
        select: activityPaymentSelect,
        orderBy: [{ paymentDate: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      }),
    ]);

    return { debts, plans, paymentsThroughCutoff, monthlyPayments };
  }

  static async loadActivityRecords(
    params: LoadMonthlyFinancialActivityParams
  ): Promise<MonthlyFinancialActivityRecordSet> {
    const customerIdWhere = params.customerId ? { customerId: params.customerId } : {};

    const [debts, plans, payments] = await Promise.all([
      prisma.debt.findMany({
        where: {
          ...customerIdWhere,
          customer: { deletedAt: null },
          createdAt: { gte: params.startDate, lt: params.nextDayAfterEnd },
        },
        select: activityDebtSelect,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      }),
      prisma.installmentPlan.findMany({
        where: {
          ...customerIdWhere,
          customer: { deletedAt: null },
          createdAt: { gte: params.startDate, lt: params.nextDayAfterEnd },
        },
        select: activityPlanSelect,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      }),
      prisma.payment.findMany({
        where: {
          ...customerIdWhere,
          customer: { deletedAt: null },
          paymentDate: { gte: params.startDate, lte: params.endDate },
        },
        select: activityPaymentSelect,
        orderBy: [{ paymentDate: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      }),
    ]);

    return { debts, plans, payments };
  }

  private static customerWhere(search?: string) {
    const trimmedSearch = search?.trim();

    return {
      customer: {
        deletedAt: null,
        ...(trimmedSearch
          ? {
              OR: [
                { name: { contains: trimmedSearch, mode: Prisma.QueryMode.insensitive } },
                { phone: { contains: trimmedSearch, mode: Prisma.QueryMode.insensitive } },
              ],
            }
          : {}),
      },
    } satisfies Pick<Prisma.DebtWhereInput, 'customer'>;
  }
}
