import { InstallmentPlanFrequency, InstallmentPlanStatus, InstallmentStatus, PaymentMethod, Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { prisma } from '../../../lib/prisma';
import { FinancialTransactionClient } from '../infrastructure/transaction';

const installmentPlanInclude = {
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
  installments: {
    include: {
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
    },
    orderBy: {
      installmentNumber: 'asc',
    },
  },
} satisfies Prisma.InstallmentPlanInclude;

export type InstallmentPlanWithDetails = Prisma.InstallmentPlanGetPayload<{
  include: typeof installmentPlanInclude;
}>;

export interface CreateInstallmentPlanData {
  customerId: string;
  description: string;
  totalAmount: Decimal;
  startDate: Date;
  installmentCount: number;
  frequency: InstallmentPlanFrequency;
  status: InstallmentPlanStatus;
  notes?: string | null;
  createdById: string;
}

export interface CreateInstallmentData {
  installmentNumber: number;
  dueDate: Date;
  amountDue: Decimal;
  status: InstallmentStatus;
}

export interface ListInstallmentPlansParams {
  customerId: string;
  skip: number;
  take: number;
  status?: InstallmentPlanStatus;
  includeCancelled: boolean;
  sortOrder: 'asc' | 'desc';
}

export interface CreateInstallmentPlanPaymentData {
  customerId: string;
  totalAmount: Decimal;
  paymentDate: Date;
  paymentMethod: PaymentMethod;
  reference?: string | null;
  notes?: string | null;
  idempotencyKey?: string | null;
  createdById: string;
}

export class InstallmentPlansRepository {
  static async findActiveCustomerById(customerId: string, tx?: FinancialTransactionClient) {
    const client = tx ?? prisma;
    return client.customer.findFirst({
      where: {
        id: customerId,
        deletedAt: null,
        isActive: true,
      },
    });
  }

  static async createPlanWithInstallments(
    tx: FinancialTransactionClient,
    planData: CreateInstallmentPlanData,
    installments: CreateInstallmentData[]
  ) {
    return tx.installmentPlan.create({
      data: {
        ...planData,
        installments: {
          create: installments,
        },
      },
      include: installmentPlanInclude,
    });
  }

  static async findPlanById(
    planId: string,
    tx?: FinancialTransactionClient
  ): Promise<InstallmentPlanWithDetails | null> {
    const client = tx ?? prisma;
    return client.installmentPlan.findUnique({
      where: { id: planId },
      include: installmentPlanInclude,
    });
  }

  static async listPlansByCustomer(params: ListInstallmentPlansParams): Promise<{
    plans: InstallmentPlanWithDetails[];
    total: number;
  }> {
    const statusFilters: Prisma.InstallmentPlanWhereInput[] = [
      ...(params.status ? [{ status: params.status }] : []),
      ...(!params.includeCancelled ? [{ status: { not: InstallmentPlanStatus.CANCELLED } }] : []),
    ];
    const where: Prisma.InstallmentPlanWhereInput = {
      customerId: params.customerId,
      ...(statusFilters.length > 0 ? { AND: statusFilters } : {}),
    };

    const [plans, total] = await Promise.all([
      prisma.installmentPlan.findMany({
        where,
        skip: params.skip,
        take: params.take,
        orderBy: { startDate: params.sortOrder },
        include: installmentPlanInclude,
      }),
      prisma.installmentPlan.count({ where }),
    ]);

    return { plans, total };
  }

  static async createPayment(tx: FinancialTransactionClient, data: CreateInstallmentPlanPaymentData) {
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

  static async createPaymentAllocations(
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

  static async updateInstallmentStatus(
    tx: FinancialTransactionClient,
    installmentId: string,
    data: {
      status: InstallmentStatus;
      paidDate?: Date | null;
    }
  ) {
    return tx.installment.update({
      where: { id: installmentId },
      data,
    });
  }

  static async updatePlanStatus(
    tx: FinancialTransactionClient,
    planId: string,
    status: InstallmentPlanStatus
  ) {
    return tx.installmentPlan.update({
      where: { id: planId },
      data: { status },
      include: installmentPlanInclude,
    });
  }

  static async cancelPlan(
    tx: FinancialTransactionClient,
    planId: string,
    data: {
      cancelledAt: Date;
      cancelledById: string;
      cancelReason: string;
    }
  ) {
    await tx.installmentPlan.update({
      where: { id: planId },
      data: {
        status: InstallmentPlanStatus.CANCELLED,
        cancelledAt: data.cancelledAt,
        cancelledById: data.cancelledById,
        cancelReason: data.cancelReason,
      },
    });

    await tx.installment.updateMany({
      where: {
        installmentPlanId: planId,
        status: {
          in: [
            InstallmentStatus.PENDING,
            InstallmentStatus.PARTIALLY_PAID,
            InstallmentStatus.OVERDUE,
          ],
        },
      },
      data: {
        status: InstallmentStatus.CANCELLED,
      },
    });

    return this.findPlanById(planId, tx);
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
