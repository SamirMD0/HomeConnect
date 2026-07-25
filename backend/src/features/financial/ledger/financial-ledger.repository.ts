import { DebtStatus, InstallmentPlanStatus, Prisma } from '@prisma/client';
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
  totalPaid: Prisma.Decimal;
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
    const paidAggregateWhere: Prisma.PaymentWhereInput = {
      ...customerWhere,
      ...(params.customerId ? { customerId: params.customerId } : {}),
      voidedAt: null,
    };

    const [debts, plans, payments, totalPaid] = await Promise.all([
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
      prisma.payment.aggregate({
        where: paidAggregateWhere,
        _sum: {
          totalAmount: true,
        },
      }),
    ]);

    return {
      debts,
      plans,
      payments,
      totalPaid: totalPaid._sum.totalAmount ?? new Prisma.Decimal('0.00'),
    };
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
}
