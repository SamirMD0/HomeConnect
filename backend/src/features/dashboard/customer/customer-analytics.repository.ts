import { scopeWhere, type BranchScope } from '../../branches/branch-scope';
import { DebtKind, DebtStatus, InstallmentPlanStatus, PrepaidPurchaseStatus, Prisma } from '@prisma/client';
import { businessDateToPrisma } from '../../financial';
import { prisma } from '../../../lib/prisma';
import { addDays } from '../shared/dashboard-range';
import type { ResolvedDashboardRange } from '../dashboard.types';
import { scopeKey, sharedLoad } from '../shared/shared-load';

const allocationInclude = {
  include: { payment: { select: { voidedAt: true, paymentDate: true, currency: true, exchangeRate: true } } },
} satisfies Prisma.PaymentAllocationFindManyArgs;

const debtInclude = {
  customer: { select: { id: true, name: true, phone: true } },
  returnAllocations: { select: { amount: true, baseAmount: true } },
  paymentAllocations: allocationInclude,
} satisfies Prisma.DebtInclude;

const planInclude = {
  customer: { select: { id: true, name: true, phone: true } },
  installments: {
    include: { paymentAllocations: allocationInclude, returnAllocations: { select: { amount: true, baseAmount: true } } },
    orderBy: { installmentNumber: 'asc' as const },
  },
} satisfies Prisma.InstallmentPlanInclude;

export type CustomerAnalyticsDebt = Prisma.DebtGetPayload<{ include: typeof debtInclude }>;
export type CustomerAnalyticsPlan = Prisma.InstallmentPlanGetPayload<{ include: typeof planInclude }>;
/** A deposit held for a customer: a prepaid record not yet delivered. */
export type CustomerAnalyticsDeposit = Prisma.DebtGetPayload<{
  select: { sourceCustomerImportId: true; paymentAllocations: typeof allocationInclude };
}>;
export type CustomerAnalyticsPayment = Prisma.PaymentGetPayload<{
  include: { customer: { select: { id: true; name: true; phone: true } } };
}>;

export interface CustomerAnalyticsRecords {
  returns?: Array<{ returnDate: Date; baseReceivableReliefAmount: Prisma.Decimal; baseRefundableAmount: Prisma.Decimal; refundMethod: string }>;
  totalCustomers: number;
  debts: CustomerAnalyticsDebt[];
  plans: CustomerAnalyticsPlan[];
  payments: CustomerAnalyticsPayment[];
  /** Money held for customers; the old system subtracts it from their balance. */
  deposits?: CustomerAnalyticsDeposit[];
}

export class CustomerAnalyticsRepository {
  static load(
    range: ResolvedDashboardRange,
    historyFrom: string,
    includeArchived: boolean,
    scope: BranchScope
  ): Promise<CustomerAnalyticsRecords> {
    return sharedLoad(
      'customer-analytics',
      [range.from, range.to, historyFrom, includeArchived, scopeKey(scope)],
      () => this.read(range, historyFrom, includeArchived, scope)
    );
  }

  private static async read(
    range: ResolvedDashboardRange,
    historyFrom: string,
    includeArchived: boolean, scope: BranchScope
  ): Promise<CustomerAnalyticsRecords> {
    const customerWhere = includeArchived ? { deletedAt: null } : { deletedAt: null, isActive: true };
    const historyDate = businessDateToPrisma(historyFrom);
    const historyEnd = businessDateToPrisma(addDays(range.to, 1));

    const [totalCustomers, openDebts, rangeDebts, openPlans, rangePlans, payments, returns, deposits] =
      await Promise.all([
        prisma.customer.count({ where: { ...scopeWhere(scope), ...customerWhere } }),
        prisma.debt.findMany({
          where: { ...scopeWhere(scope),
            customer: customerWhere,
            kind: DebtKind.STANDARD,
            status: { notIn: [DebtStatus.PAID, DebtStatus.CANCELLED] },
            cancelledAt: null,
          },
          include: { ...debtInclude, branch: {select:{name:true}} },
        }),
        prisma.debt.findMany({
          where: { ...scopeWhere(scope),
            customer: customerWhere,
            kind: DebtKind.STANDARD,
            createdAt: { gte: historyDate, lt: historyEnd },
          },
          include: { ...debtInclude, branch: {select:{name:true}} },
        }),
        prisma.installmentPlan.findMany({
          where: { ...scopeWhere(scope),
            customer: customerWhere,
            status: { notIn: [InstallmentPlanStatus.COMPLETED, InstallmentPlanStatus.CANCELLED] },
            cancelledAt: null,
          },
          include: { ...planInclude, branch: {select:{name:true}} },
        }),
        prisma.installmentPlan.findMany({
          where: { ...scopeWhere(scope),
            customer: customerWhere,
            createdAt: { gte: historyDate, lt: historyEnd },
          },
          include: { ...planInclude, branch: {select:{name:true}} },
        }),
        prisma.payment.findMany({
          where: { ...scopeWhere(scope),
            OR: [{ customerId: null }, { customer: customerWhere }],
            voidedAt: null,
            paymentDate: { gte: historyDate, lt: historyEnd },
          },
          include: { branch: {select:{name:true}},  customer: { select: { id: true, name: true, phone: true } } },
        }),
        prisma.salesReturn.findMany({
          where: { ...scopeWhere(scope),  returnDate: { gte: historyDate, lt: historyEnd }, OR: [{ customerId: null }, { customer: customerWhere }] },
          select: { branchId: true, branch: {select:{name:true}},  returnDate: true, baseReceivableReliefAmount: true, baseRefundableAmount: true, refundMethod: true },
        }),
        prisma.debt.findMany({
          where: { ...scopeWhere(scope),
            customer: customerWhere,
            kind: DebtKind.PREPAID_PURCHASE,
            status: { not: DebtStatus.CANCELLED },
            cancelledAt: null,
            // A prepaid record with no companion row predates delivery and still counts as held.
            OR: [{ prepaidPurchase: { status: PrepaidPurchaseStatus.PENDING } }, { prepaidPurchase: null }],
          },
          select: { sourceCustomerImportId: true, paymentAllocations: allocationInclude },
        }),
      ]);

    return {
      returns,
      totalCustomers,
      debts: dedupeById([...openDebts, ...rangeDebts]),
      plans: dedupeById([...openPlans, ...rangePlans]),
      payments,
      deposits,
    };
  }
}

function dedupeById<T extends { id: string }>(records: T[]): T[] {
  return [...new Map(records.map((record) => [record.id, record])).values()];
}
