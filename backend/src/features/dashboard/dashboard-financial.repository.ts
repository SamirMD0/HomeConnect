import { DebtStatus, InstallmentPlanStatus, Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';

const customerSelect = {
  id: true,
  name: true,
  phone: true,
} satisfies Prisma.CustomerSelect;

const paymentAllocationPaymentSelect = {
  id: true,
  voidedAt: true,
} satisfies Prisma.PaymentSelect;

const dashboardDebtInclude = {
  customer: { select: customerSelect },
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
  totalCustomers: number;
  debts: DashboardDebtRecord[];
  plans: DashboardPlanRecord[];
  payments: DashboardPaymentRecord[];
}

export class DashboardFinancialRepository {
  static async loadFinancialRecords(): Promise<DashboardFinancialRecordSet> {
    const [totalCustomers, debts, plans, payments] = await Promise.all([
      prisma.customer.count({
        where: {
          deletedAt: null,
          isActive: true,
        },
      }),
      prisma.debt.findMany({
        where: {
          customer: {
            deletedAt: null,
            isActive: true,
          },
          status: { not: DebtStatus.CANCELLED },
        },
        include: dashboardDebtInclude,
        orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }, { id: 'asc' }],
      }),
      prisma.installmentPlan.findMany({
        where: {
          customer: {
            deletedAt: null,
            isActive: true,
          },
          status: { not: InstallmentPlanStatus.CANCELLED },
        },
        include: dashboardPlanInclude,
        orderBy: [{ startDate: 'asc' }, { createdAt: 'desc' }, { id: 'asc' }],
      }),
      prisma.payment.findMany({
        where: {
          customer: {
            deletedAt: null,
            isActive: true,
          },
          voidedAt: null,
        },
        include: dashboardPaymentInclude,
        orderBy: [{ paymentDate: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
      }),
    ]);

    return {
      totalCustomers,
      debts,
      plans,
      payments,
    };
  }
}
