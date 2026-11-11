import { scopeWhere, type BranchScope } from '../branches/branch-scope';
import { DebtStatus, InstallmentPlanStatus, Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { businessDateToPrisma, todayInBusinessTimezone } from '../financial';

const customerSelect = {
  id: true,
  name: true,
  phone: true,
} satisfies Prisma.CustomerSelect;

const paymentAllocationPaymentSelect = {
  id: true,
  voidedAt: true,
  currency: true,
  exchangeRate: true,
} satisfies Prisma.PaymentSelect;

const dashboardDebtInclude = {
  customer: { select: customerSelect },
  returnAllocations: { select: { amount: true, baseAmount: true } },
  paymentAllocations: {
    include: {
      payment: { select: paymentAllocationPaymentSelect },
    },
  },
} satisfies Prisma.DebtInclude;

const dashboardPlanInclude = {
  customer: { select: customerSelect },
  installments: {
    include: {
      returnAllocations: { select: { amount: true, baseAmount: true } },
      paymentAllocations: {
        include: {
          payment: { select: paymentAllocationPaymentSelect },
        },
      },
    },
    orderBy: { installmentNumber: 'asc' },
  },
} satisfies Prisma.InstallmentPlanInclude;

const dashboardPaymentInclude = {
  customer: { select: customerSelect },
  allocations: {
    select: {
      id: true,
    },
  },
} satisfies Prisma.PaymentInclude;

export type DashboardDebtRecord = Prisma.DebtGetPayload<{ include: typeof dashboardDebtInclude }>;
export type DashboardPlanRecord = Prisma.InstallmentPlanGetPayload<{ include: typeof dashboardPlanInclude }>;
export type DashboardPaymentRecord = Prisma.PaymentGetPayload<{ include: typeof dashboardPaymentInclude }>;

export interface DashboardFinancialRecordSet {
  returns?: Array<{ branchId?: string; returnDate: Date; baseReceivableReliefAmount: Prisma.Decimal; baseRefundableAmount: Prisma.Decimal; refundMethod: string }>;
  totalCustomers: number;
  debts: DashboardDebtRecord[];
  plans: DashboardPlanRecord[];
  payments: DashboardPaymentRecord[];
}

export class DashboardFinancialRepository {
  static async loadFinancialRecords(scope: BranchScope): Promise<DashboardFinancialRecordSet> {
    const businessDate = todayInBusinessTimezone();
    const monthStart = businessDateToPrisma(`${businessDate.slice(0, 7)}-01`);
    const [totalCustomers, debts, plans, monthlyPayments, recentPayments, returns] = await Promise.all([
      prisma.customer.count({
        where: { ...scopeWhere(scope),
          deletedAt: null,
          isActive: true,
        },
      }),
      prisma.debt.findMany({
        where: { ...scopeWhere(scope),
          customer: {
            deletedAt: null,
            isActive: true,
          },
          status: { not: DebtStatus.CANCELLED },
          OR: [
            { status: { notIn: [DebtStatus.PAID, DebtStatus.CANCELLED] } },
            { createdAt: { gte: monthStart } },
          ],
        },
        include: { ...dashboardDebtInclude, branch: {select:{name:true}} },
        orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }, { id: 'asc' }],
      }),
      prisma.installmentPlan.findMany({
        where: { ...scopeWhere(scope),
          customer: {
            deletedAt: null,
            isActive: true,
          },
          status: { not: InstallmentPlanStatus.CANCELLED },
          OR: [
            { status: { notIn: [InstallmentPlanStatus.COMPLETED, InstallmentPlanStatus.CANCELLED] } },
            { createdAt: { gte: monthStart } },
          ],
        },
        include: { ...dashboardPlanInclude, branch: {select:{name:true}} },
        orderBy: [{ startDate: 'asc' }, { createdAt: 'desc' }, { id: 'asc' }],
      }),
      prisma.payment.findMany({
        where: { ...scopeWhere(scope),
          OR: [{ customerId: null }, { customer: { deletedAt: null, isActive: true } }],
          voidedAt: null,
          paymentDate: { gte: monthStart },
        },
        include: { ...dashboardPaymentInclude, branch: {select:{name:true}} },
        orderBy: [{ paymentDate: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
      }),
      prisma.payment.findMany({
        where: { ...scopeWhere(scope),
          OR: [{ customerId: null }, { customer: { deletedAt: null, isActive: true } }],
          voidedAt: null,
        },
        include: { ...dashboardPaymentInclude, branch: {select:{name:true}} },
        orderBy: [{ paymentDate: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
        take: 5,
      }),
      prisma.salesReturn.findMany({
        where: { ...scopeWhere(scope),  returnDate: { gte: monthStart }, OR: [{ customerId: null }, { customer: { deletedAt: null, isActive: true } }] },
        select: { branchId: true, branch: {select:{name:true}},  returnDate: true, baseReceivableReliefAmount: true, baseRefundableAmount: true, refundMethod: true },
      }),
    ]);

    return {
      returns,
      totalCustomers,
      debts,
      plans,
      payments: mergePayments(monthlyPayments, recentPayments),
    };
  }

  /** Loads the full-scope record set once and splits it per branch, so a
   * dashboard branch breakdown costs one load instead of one per branch.
   * Every per-branch set equals what loadFinancialRecords would return for
   * that single branch. */
  static async loadFinancialRecordsByBranch(scope: BranchScope): Promise<{
    total: DashboardFinancialRecordSet;
    byBranch: Map<string, DashboardFinancialRecordSet>;
  }> {
    const monthStart = businessDateToPrisma(`${todayInBusinessTimezone().slice(0, 7)}-01`);
    const [total, customerCounts] = await Promise.all([
      this.loadFinancialRecords(scope),
      prisma.customer.groupBy({
        by: ['branchId'],
        where: { ...scopeWhere(scope), deletedAt: null, isActive: true },
        _count: { _all: true },
      }),
    ]);
    const countByBranch = new Map(customerCounts.map((row) => [row.branchId, row._count._all]));
    // The full-scope set holds this month's payments plus the five most recent
    // overall. A branch with fewer than five payments this month needs its own
    // five most recent, which the overall five may not contain.
    const monthlyByBranch = new Map(scope.branchIds.map((branchId) => [
      branchId,
      total.payments.filter((payment) => payment.branchId === branchId && payment.paymentDate >= monthStart),
    ]));
    const recentByBranch = new Map(await Promise.all(
      scope.branchIds
        .filter((branchId) => (monthlyByBranch.get(branchId)?.length ?? 0) < 5)
        .map(async (branchId) => [branchId, await prisma.payment.findMany({
          where: {
            branchId,
            OR: [{ customerId: null }, { customer: { deletedAt: null, isActive: true } }],
            voidedAt: null,
          },
          include: { ...dashboardPaymentInclude, branch: { select: { name: true } } },
          orderBy: [{ paymentDate: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
          take: 5,
        })] as const)
    ));

    const byBranch = new Map(scope.branchIds.map((branchId) => [branchId, {
      returns: total.returns?.filter((record) => record.branchId === branchId),
      totalCustomers: countByBranch.get(branchId) ?? 0,
      debts: total.debts.filter((debt) => debt.branchId === branchId),
      plans: total.plans.filter((plan) => plan.branchId === branchId),
      payments: mergePayments(monthlyByBranch.get(branchId) ?? [], recentByBranch.get(branchId) ?? []),
    }]));
    return { total, byBranch };
  }
}

function mergePayments<T extends { id: string }>(monthly: T[], recent: T[]): T[] {
  return [...new Map([...monthly, ...recent].map((payment) => [payment.id, payment])).values()];
}
