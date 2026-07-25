import { DebtStatus, InstallmentPlanStatus, Prisma } from '@prisma/client';
import { prisma } from '../../../lib/prisma';

const userSelect = {
  id: true,
  fullName: true,
  username: true,
} satisfies Prisma.UserSelect;

const customerSelect = {
  id: true,
  name: true,
  phone: true,
  address: true,
  notes: true,
  isActive: true,
  deletedAt: true,
} satisfies Prisma.CustomerSelect;

const debtInclude = {
  createdBy: {
    select: userSelect,
  },
  cancelledBy: {
    select: userSelect,
  },
  paymentAllocations: {
    include: {
      payment: {
        select: {
          id: true,
          voidedAt: true,
        },
      },
    },
    orderBy: {
      createdAt: 'asc',
    },
  },
} satisfies Prisma.DebtInclude;

const installmentPlanInclude = {
  createdBy: {
    select: userSelect,
  },
  cancelledBy: {
    select: userSelect,
  },
  installments: {
    include: {
      paymentAllocations: {
        include: {
          payment: {
            select: {
              id: true,
              voidedAt: true,
            },
          },
        },
        orderBy: {
          createdAt: 'asc',
        },
      },
    },
    orderBy: {
      installmentNumber: 'asc',
    },
  },
} satisfies Prisma.InstallmentPlanInclude;

const paymentInclude = {
  createdBy: {
    select: userSelect,
  },
  voidedBy: {
    select: userSelect,
  },
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
          installmentNumber: true,
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
    orderBy: {
      createdAt: 'asc',
    },
  },
} satisfies Prisma.PaymentInclude;

export type FinancialSummaryCustomer = Prisma.CustomerGetPayload<{ select: typeof customerSelect }>;
export type FinancialSummaryDebt = Prisma.DebtGetPayload<{ include: typeof debtInclude }>;
export type FinancialSummaryPlan = Prisma.InstallmentPlanGetPayload<{
  include: typeof installmentPlanInclude;
}>;
export type FinancialSummaryPayment = Prisma.PaymentGetPayload<{ include: typeof paymentInclude }>;

export interface LoadCustomerFinancialSummaryParams {
  customerId: string;
  includeCancelled: boolean;
  includePayments: boolean;
  paymentLimit: number;
}

export interface CustomerFinancialSummaryRecordSet {
  customer: FinancialSummaryCustomer | null;
  debts: FinancialSummaryDebt[];
  plans: FinancialSummaryPlan[];
  totalPaid: Prisma.Decimal;
  recentPayments: FinancialSummaryPayment[];
}

export class CustomerFinancialSummaryRepository {
  static async loadCustomerFinancialSummary(
    params: LoadCustomerFinancialSummaryParams
  ): Promise<CustomerFinancialSummaryRecordSet> {
    const debtWhere: Prisma.DebtWhereInput = {
      customerId: params.customerId,
      ...(!params.includeCancelled ? { status: { not: DebtStatus.CANCELLED } } : {}),
    };
    const planWhere: Prisma.InstallmentPlanWhereInput = {
      customerId: params.customerId,
      ...(!params.includeCancelled ? { status: { not: InstallmentPlanStatus.CANCELLED } } : {}),
    };

    const [customer, debts, plans, paidAggregate, recentPayments] = await Promise.all([
      prisma.customer.findFirst({
        where: {
          id: params.customerId,
          deletedAt: null,
        },
        select: customerSelect,
      }),
      prisma.debt.findMany({
        where: debtWhere,
        orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
        include: debtInclude,
      }),
      prisma.installmentPlan.findMany({
        where: planWhere,
        orderBy: [{ startDate: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
        include: installmentPlanInclude,
      }),
      prisma.payment.aggregate({
        where: {
          customerId: params.customerId,
          voidedAt: null,
        },
        _sum: {
          totalAmount: true,
        },
      }),
      params.includePayments
        ? prisma.payment.findMany({
            where: {
              customerId: params.customerId,
            },
            take: params.paymentLimit,
            orderBy: [{ paymentDate: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
            include: paymentInclude,
          })
        : Promise.resolve([]),
    ]);

    return {
      customer,
      debts,
      plans,
      totalPaid: paidAggregate._sum.totalAmount ?? new Prisma.Decimal('0.00'),
      recentPayments,
    };
  }
}
