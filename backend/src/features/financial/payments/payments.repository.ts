import { Currency, PaymentMethod, Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { prisma } from '../../../lib/prisma';
import { FinancialTransactionClient } from '../infrastructure/transaction';

const paymentInclude = {
  customer: {
    select: {
      id: true,
      name: true,
      phone: true,
    },
  },
  createdBy: {
    select: {
      id: true,
      fullName: true,
      username: true,
    },
  },
  voidedBy: {
    select: {
      id: true,
      fullName: true,
      username: true,
    },
  },
  allocations: {
    include: {
      debt: { select: { returnAllocations: { select: { id: true } } } },
      installment: {
        select: {
          id: true,
          installmentPlanId: true,
          installmentPlan: { select: { installments: { select: { returnAllocations: { select: { id: true } } } } } },
        },
      },
    },
    orderBy: {
      createdAt: 'asc',
    },
  },
} satisfies Prisma.PaymentInclude;

const receiptAllocationHistory = {
  select: {
    id: true,
    amount: true,
    createdAt: true,
    voidedAt: true,
  },
  orderBy: { createdAt: 'asc' as const },
};

const paymentReceiptInclude = {
  salesOrder: { select: { id: true, orderNumber: true } },
  customer: {
    select: { id: true, name: true, phone: true, address: true },
  },
  createdBy: {
    select: { id: true, fullName: true, username: true },
  },
  voidedBy: {
    select: { id: true, fullName: true, username: true },
  },
  allocations: {
    include: {
      debt: {
        select: {
          id: true,
          description: true,
          originalAmount: true,
          currency: true,
          returnAllocations: { select: { amount: true, createdAt: true } },
          paymentAllocations: receiptAllocationHistory,
        },
      },
      installment: {
        select: {
          id: true,
          installmentNumber: true,
          installmentPlan: {
            select: {
              id: true,
              description: true,
              totalAmount: true,
              currency: true,
              installments: {
                select: { paymentAllocations: receiptAllocationHistory, returnAllocations: { select: { amount: true, createdAt: true } } },
              },
            },
          },
        },
      },
    },
    orderBy: { createdAt: 'asc' as const },
  },
} satisfies Prisma.PaymentInclude;

export type PaymentWithDetails = Prisma.PaymentGetPayload<{ include: typeof paymentInclude }>;
export type PaymentReceiptRecord = Prisma.PaymentGetPayload<{ include: typeof paymentReceiptInclude }>;

export interface CreateReplacementPaymentData {
  customerId: string;
  totalAmount: Decimal;
  currency?: Currency;
  exchangeRate?: Decimal;
  baseAmount?: Decimal;
  paymentDate: Date;
  paymentMethod: PaymentMethod;
  reference?: string | null;
  notes?: string | null;
  createdById: string;
}

export class PaymentsRepository {
  static findByIdempotencyKey(idempotencyKey: string, tx: FinancialTransactionClient) {
    return tx.payment.findUnique({ where: { idempotencyKey } });
  }
  static createCounterReceipt(tx: FinancialTransactionClient, data: Prisma.PaymentUncheckedCreateInput) {
    return tx.payment.create({ data });
  }
  static async findPaymentReceipt(paymentId: string): Promise<PaymentReceiptRecord | null> {
    return prisma.payment.findUnique({ where: { id: paymentId }, include: paymentReceiptInclude });
  }

  static async findUserIdentity(userId: string) {
    return prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        fullName: true,
        username: true,
      },
    });
  }

  static async findPaymentById(
    paymentId: string,
    tx?: FinancialTransactionClient
  ): Promise<PaymentWithDetails | null> {
    const client = tx ?? prisma;
    return client.payment.findUnique({
      where: { id: paymentId },
      include: paymentInclude,
    });
  }

  static async voidPayment(
    tx: FinancialTransactionClient,
    paymentId: string,
    data: {
      voidedAt: Date;
      voidedById: string;
      voidReason: string;
    }
  ) {
    return tx.payment.update({
      where: { id: paymentId },
      data,
      include: paymentInclude,
    });
  }

  static async voidAllocationsForPayment(
    tx: FinancialTransactionClient,
    paymentId: string,
    data: {
      voidedAt: Date;
      voidedById: string;
    }
  ) {
    return tx.paymentAllocation.updateMany({
      where: {
        paymentId,
        voidedAt: null,
      },
      data,
    });
  }

  static async linkAllocationsToCorrection(
    tx: FinancialTransactionClient,
    paymentId: string,
    correctionId: string
  ) {
    return tx.paymentAllocation.updateMany({
      where: { paymentId },
      data: { correctionId },
    });
  }

  static async updatePaymentDetails(
    tx: FinancialTransactionClient,
    paymentId: string,
    data: {
      paymentDate: Date;
      paymentMethod: PaymentMethod;
      reference?: string | null;
      notes?: string | null;
    }
  ) {
    return tx.payment.update({
      where: { id: paymentId },
      data,
      include: paymentInclude,
    });
  }

  static async createReplacementPayment(
    tx: FinancialTransactionClient,
    data: CreateReplacementPaymentData
  ) {
    return tx.payment.create({
      data: {
        ...data,
        idempotencyKey: null,
        baseAmount: data.baseAmount ?? data.totalAmount,
      },
      include: paymentInclude,
    });
  }

  static async createDebtAllocation(
    tx: FinancialTransactionClient,
    data: {
      paymentId: string;
      debtId: string;
      amount: Decimal;
      paymentAmount?: Decimal;
      exchangeRate?: Decimal;
    }
  ) {
    return tx.paymentAllocation.create({
      data: {
        paymentId: data.paymentId,
        debtId: data.debtId,
        installmentId: null,
        amount: data.amount,
        paymentAmount: data.paymentAmount ?? data.amount,
        exchangeRate: data.exchangeRate,
      },
    });
  }

  static async createInstallmentAllocations(
    tx: FinancialTransactionClient,
    allocations: Array<{
      paymentId: string;
      installmentId: string;
      amount: Decimal;
      paymentAmount?: Decimal;
      exchangeRate?: Decimal;
    }>
  ) {
    return tx.paymentAllocation.createMany({
      data: allocations.map((allocation) => ({
        paymentId: allocation.paymentId,
        debtId: null,
        installmentId: allocation.installmentId,
        amount: allocation.amount,
        paymentAmount: allocation.paymentAmount ?? allocation.amount,
        exchangeRate: allocation.exchangeRate,
      })),
    });
  }

  static async findInstallmentsByIds(tx: FinancialTransactionClient, installmentIds: string[]) {
    return tx.installment.findMany({
      where: {
        id: { in: installmentIds },
      },
      include: {
        installmentPlan: {
          select: {
            id: true,
            customerId: true,
            status: true,
            cancelledAt: true,
          },
        },
        returnAllocations: { select: { amount: true } },
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
    });
  }
}
