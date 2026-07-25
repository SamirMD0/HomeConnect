import { DebtStatus, PaymentMethod, Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { prisma } from '../../../lib/prisma';
import { FinancialTransactionClient } from '../infrastructure/transaction';

const debtInclude = {
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
  cancelledBy: {
    select: {
      id: true,
      fullName: true,
      username: true,
    },
  },
  paymentAllocations: {
    include: {
      payment: {
        include: {
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
          allocations: true,
        },
      },
    },
    orderBy: {
      createdAt: 'asc',
    },
  },
} satisfies Prisma.DebtInclude;

export type DebtWithDetails = Prisma.DebtGetPayload<{ include: typeof debtInclude }>;

export interface ListDebtsParams {
  customerId: string;
  skip: number;
  take: number;
  status?: DebtStatus;
  includeCancelled: boolean;
  sortBy: 'dueDate' | 'createdAt';
  sortOrder: 'asc' | 'desc';
}

export interface CreateDebtData {
  customerId: string;
  description: string;
  originalAmount: Decimal;
  dueDate: Date;
  status: DebtStatus;
  notes?: string | null;
  createdById: string;
}

export interface CreateDebtPaymentData {
  customerId: string;
  totalAmount: Decimal;
  paymentDate: Date;
  paymentMethod: PaymentMethod;
  reference?: string | null;
  notes?: string | null;
  idempotencyKey?: string | null;
  createdById: string;
}

export class DebtsRepository {
  static async findActiveCustomerById(customerId: string) {
    return prisma.customer.findFirst({
      where: {
        id: customerId,
        deletedAt: null,
        isActive: true,
      },
    });
  }

  static async createDebt(data: CreateDebtData): Promise<DebtWithDetails> {
    return prisma.debt.create({
      data,
      include: debtInclude,
    });
  }

  static async findDebtById(debtId: string, tx?: FinancialTransactionClient): Promise<DebtWithDetails | null> {
    const client = tx ?? prisma;
    return client.debt.findUnique({
      where: { id: debtId },
      include: debtInclude,
    });
  }

  static async listDebtsByCustomer(params: ListDebtsParams): Promise<{
    debts: DebtWithDetails[];
    total: number;
  }> {
    const statusFilters: Prisma.DebtWhereInput[] = [
      ...(params.status ? [{ status: params.status }] : []),
      ...(!params.includeCancelled ? [{ status: { not: DebtStatus.CANCELLED } }] : []),
    ];
    const where: Prisma.DebtWhereInput = {
      customerId: params.customerId,
      ...(statusFilters.length > 0 ? { AND: statusFilters } : {}),
    };

    const [debts, total] = await Promise.all([
      prisma.debt.findMany({
        where,
        skip: params.skip,
        take: params.take,
        orderBy: { [params.sortBy]: params.sortOrder },
        include: debtInclude,
      }),
      prisma.debt.count({ where }),
    ]);

    return { debts, total };
  }

  static async createPayment(tx: FinancialTransactionClient, data: CreateDebtPaymentData) {
    return tx.payment.create({
      data,
      include: {
        allocations: true,
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
      },
    });
  }

  static async createDebtPaymentAllocation(
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

  static async updateDebtStatus(
    tx: FinancialTransactionClient,
    debtId: string,
    status: DebtStatus
  ) {
    return tx.debt.update({
      where: { id: debtId },
      data: { status },
      include: debtInclude,
    });
  }

  static async cancelDebt(
    tx: FinancialTransactionClient,
    debtId: string,
    data: {
      cancelledAt: Date;
      cancelledById: string;
      cancelReason: string;
    }
  ) {
    return tx.debt.update({
      where: { id: debtId },
      data: {
        status: DebtStatus.CANCELLED,
        cancelledAt: data.cancelledAt,
        cancelledById: data.cancelledById,
        cancelReason: data.cancelReason,
      },
      include: debtInclude,
    });
  }

  static async findPaymentByIdempotencyKey(
    tx: FinancialTransactionClient,
    idempotencyKey: string
  ) {
    return tx.payment.findUnique({
      where: { idempotencyKey },
      include: {
        allocations: true,
      },
    });
  }
}
