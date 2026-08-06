import { DebtStatus, InstallmentPlanStatus, Prisma } from '@prisma/client';
import { prisma } from '../../../lib/prisma';

const customerSelect = {
  id: true,
  name: true,
  phone: true,
  isActive: true,
} satisfies Prisma.CustomerSelect;

const paymentAllocationPaymentSelect = {
  id: true,
  voidedAt: true,
} satisfies Prisma.PaymentSelect;

const receivableDebtInclude = {
  paymentAllocations: {
    include: {
      payment: { select: paymentAllocationPaymentSelect },
    },
  },
} satisfies Prisma.DebtInclude;

const receivablePlanInclude = {
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

const receivablePaymentSelect = {
  id: true,
  customerId: true,
  totalAmount: true,
  paymentDate: true,
} satisfies Prisma.PaymentSelect;

export type ReceivableCustomerRecord = Prisma.CustomerGetPayload<{ select: typeof customerSelect }>;
export type ReceivableDebtRecord = Prisma.DebtGetPayload<{ include: typeof receivableDebtInclude }>;
export type ReceivablePlanRecord = Prisma.InstallmentPlanGetPayload<{
  include: typeof receivablePlanInclude;
}>;
export type ReceivablePaymentRecord = Prisma.PaymentGetPayload<{
  select: typeof receivablePaymentSelect;
}>;

export interface LoadReceivableRecordsParams {
  includeInactive: boolean;
  /**
   * Restricts the load to these customers instead of the whole book.
   *
   * The receivables page still loads everything — it has to, because it ranks
   * and summarises the full customer base. List-style callers that only need a
   * financial column for the page they are already showing pass their ids here
   * so the four queries stay proportional to that page.
   */
  customerIds?: string[];
}

export interface ReceivableRecordSet {
  customers: ReceivableCustomerRecord[];
  debts: ReceivableDebtRecord[];
  plans: ReceivablePlanRecord[];
  payments: ReceivablePaymentRecord[];
}

export class ReceivablesRepository {
  static async loadReceivableRecords(
    params: LoadReceivableRecordsParams
  ): Promise<ReceivableRecordSet> {
    // The id filter also reaches debts, plans and payments through
    // `relatedCustomerWhere` below, so scoping happens in the database rather
    // than by loading the whole book and discarding most of it.
    const customerWhere: Prisma.CustomerWhereInput = {
      deletedAt: null,
      ...(params.includeInactive ? {} : { isActive: true }),
      ...(params.customerIds ? { id: { in: params.customerIds } } : {}),
    };
    const relatedCustomerWhere = { customer: customerWhere };

    const [customers, debts, plans, payments] = await Promise.all([
      prisma.customer.findMany({
        where: customerWhere,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        select: customerSelect,
      }),
      prisma.debt.findMany({
        where: {
          ...relatedCustomerWhere,
          status: { not: DebtStatus.CANCELLED },
        },
        include: receivableDebtInclude,
        orderBy: [{ dueDate: 'asc' }, { id: 'asc' }],
      }),
      prisma.installmentPlan.findMany({
        where: {
          ...relatedCustomerWhere,
          status: { not: InstallmentPlanStatus.CANCELLED },
        },
        include: receivablePlanInclude,
        orderBy: [{ startDate: 'asc' }, { id: 'asc' }],
      }),
      prisma.payment.findMany({
        where: {
          ...relatedCustomerWhere,
          voidedAt: null,
        },
        select: receivablePaymentSelect,
        orderBy: [{ paymentDate: 'desc' }, { id: 'asc' }],
      }),
    ]);

    return { customers, debts, plans, payments };
  }
}
