import { PaymentMethod, Prisma } from '@prisma/client';
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
      installment: {
        select: {
          id: true,
          installmentPlanId: true,
        },
      },
    },
    orderBy: {
      createdAt: 'asc',
    },
  },
} satisfies Prisma.PaymentInclude;

export type PaymentWithDetails = Prisma.PaymentGetPayload<{ include: typeof paymentInclude }>;

export interface CreateReplacementPaymentData {
  customerId: string;
  totalAmount: Decimal;
  paymentDate: Date;
  paymentMethod: PaymentMethod;
  reference?: string | null;
  notes?: string | null;
  createdById: string;
}

export class PaymentsRepository {
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
    }
  ) {
    return tx.paymentAllocation.create({
      data: {
        paymentId: data.paymentId,
        debtId: data.debtId,
        installmentId: null,
        amount: data.amount,
      },
    });
  }

  static async createInstallmentAllocations(
    tx: FinancialTransactionClient,
    allocations: Array<{
      paymentId: string;
      installmentId: string;
      amount: Decimal;
    }>
  ) {
    return tx.paymentAllocation.createMany({
      data: allocations.map((allocation) => ({
        paymentId: allocation.paymentId,
        debtId: null,
        installmentId: allocation.installmentId,
        amount: allocation.amount,
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
