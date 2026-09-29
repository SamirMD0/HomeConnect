import { DebtKind, Prisma } from '@prisma/client';
import { prisma } from '../../../lib/prisma';

const debtSelect = {
  id: true,
  description: true,
  originalAmount: true,
  baseOriginalAmount: true,
  currency: true,
  exchangeRate: true,
  dueDate: true,
  status: true,
  createdAt: true,
  cancelledAt: true,
  cancelReason: true,
  salesOrder: { select: { orderNumber: true } },
} satisfies Prisma.DebtSelect;

const planSelect = {
  id: true,
  description: true,
  currency: true,
  exchangeRate: true,
  status: true,
  createdAt: true,
  cancelledAt: true,
  cancelReason: true,
  salesOrder: { select: { orderNumber: true } },
  installments: {
    select: {
      id: true,
      installmentNumber: true,
      amountDue: true,
      baseAmountDue: true,
      dueDate: true,
      status: true,
      createdAt: true,
    },
    orderBy: [{ installmentNumber: 'asc' as const }, { id: 'asc' as const }],
  },
} satisfies Prisma.InstallmentPlanSelect;

const paymentSelect = {
  id: true,
  totalAmount: true,
  baseAmount: true,
  currency: true,
  exchangeRate: true,
  paymentDate: true,
  paymentMethod: true,
  reference: true,
  notes: true,
  createdAt: true,
  voidedAt: true,
  voidReason: true,
  allocations: {
    select: {
      id: true,
      debtId: true,
      installmentId: true,
      paymentAmount: true,
      voidedAt: true,
    },
    orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }],
  },
} satisfies Prisma.PaymentSelect;

const returnSelect = {
  id: true,
  returnNumber: true,
  returnDate: true,
  processedAt: true,
  reason: true,
  currency: true,
  exchangeRate: true,
  totalIncVat: true,
  baseTotalIncVat: true,
  receivableReliefAmount: true,
  baseReceivableReliefAmount: true,
  refundableAmount: true,
  refundMethod: true,
  receivableAllocations: {
    select: { id: true, debtId: true, installmentId: true, baseAmount: true, createdAt: true },
    orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }],
  },
} satisfies Prisma.SalesReturnSelect;

export type StatementDebtRecord = Prisma.DebtGetPayload<{ select: typeof debtSelect }>;
export type StatementPlanRecord = Prisma.InstallmentPlanGetPayload<{ select: typeof planSelect }>;
export type StatementPaymentRecord = Prisma.PaymentGetPayload<{ select: typeof paymentSelect }>;
export type StatementReturnRecord = Prisma.SalesReturnGetPayload<{ select: typeof returnSelect }>;

export interface CustomerStatementRecordSet {
  customer: { id: string; name: string; phone: string; address: string | null } | null;
  debts: StatementDebtRecord[];
  plans: StatementPlanRecord[];
  payments: StatementPaymentRecord[];
  returns?: StatementReturnRecord[];
}

export class CustomerStatementRepository {
  static async load(customerId: string): Promise<CustomerStatementRecordSet> {
    const [customer, debts, plans, payments, returns] = await Promise.all([
      prisma.customer.findFirst({
        where: { id: customerId, deletedAt: null },
        select: { id: true, name: true, phone: true, address: true },
      }),
      prisma.debt.findMany({
        where: { customerId, kind: DebtKind.STANDARD },
        select: debtSelect,
      }),
      prisma.installmentPlan.findMany({ where: { customerId }, select: planSelect }),
      prisma.payment.findMany({ where: { customerId }, select: paymentSelect }),
      prisma.salesReturn.findMany({ where: { customerId }, select: returnSelect }),
    ]);
    return { customer, debts, plans, payments, returns };
  }
}
