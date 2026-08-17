import { DebtKind, Prisma, PrepaidPurchaseStatus } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { FinancialTransactionClient } from '../infrastructure/transaction';

const userSelect = {
  id: true,
  fullName: true,
  username: true,
} satisfies Prisma.UserSelect;

const prepaidInclude = {
  debt: {
    include: {
      customer: {
        select: {
          id: true,
          name: true,
          phone: true,
        },
      },
      createdBy: {
        select: userSelect,
      },
      // A prepaid item is normally paid across several bills, so the payment
      // rows are loaded in full: the aggregate alone cannot show that history.
      paymentAllocations: {
        include: {
          payment: {
            select: {
              id: true,
              paymentDate: true,
              paymentMethod: true,
              reference: true,
              notes: true,
              voidedAt: true,
              createdAt: true,
              createdBy: {
                select: userSelect,
              },
            },
          },
        },
        orderBy: {
          createdAt: 'asc',
        },
      },
    },
  },
  deliveredBy: {
    select: userSelect,
  },
} satisfies Prisma.PrepaidPurchaseInclude;

export type PrepaidPurchaseWithDetails = Prisma.PrepaidPurchaseGetPayload<{
  include: typeof prepaidInclude;
}>;

export interface ListPrepaidParams {
  where: Prisma.PrepaidPurchaseWhereInput;
  skip: number;
  take: number;
  orderBy: Prisma.PrepaidPurchaseOrderByWithRelationInput[];
}

export class PrepaidRepository {
  /** Companion row for a newly created prepaid debt. Runs inside the creation transaction. */
  static async createForDebt(
    tx: FinancialTransactionClient,
    data: { debtId: string; productId?: string | null }
  ) {
    return tx.prepaidPurchase.create({
      data: {
        debtId: data.debtId,
        productId: data.productId ?? null,
        status: PrepaidPurchaseStatus.PENDING,
      },
    });
  }

  static async findById(
    id: string,
    tx?: FinancialTransactionClient
  ): Promise<PrepaidPurchaseWithDetails | null> {
    const client = tx ?? prisma;
    return client.prepaidPurchase.findUnique({
      where: { id },
      include: prepaidInclude,
    });
  }

  static async findByDebtId(
    debtId: string,
    tx?: FinancialTransactionClient
  ): Promise<PrepaidPurchaseWithDetails | null> {
    const client = tx ?? prisma;
    return client.prepaidPurchase.findUnique({
      where: { debtId },
      include: prepaidInclude,
    });
  }

  static async list(params: ListPrepaidParams): Promise<{
    items: PrepaidPurchaseWithDetails[];
    total: number;
  }> {
    const [items, total] = await Promise.all([
      prisma.prepaidPurchase.findMany({
        where: params.where,
        skip: params.skip,
        take: params.take,
        orderBy: [...params.orderBy, { id: 'asc' }],
        include: prepaidInclude,
      }),
      prisma.prepaidPurchase.count({ where: params.where }),
    ]);

    return { items, total };
  }

  /**
   * Every row matching the filter, used to build the summary.
   * Totals must never be derived from the current page slice.
   */
  static async findAllForSummary(
    where: Prisma.PrepaidPurchaseWhereInput
  ): Promise<PrepaidPurchaseWithDetails[]> {
    return prisma.prepaidPurchase.findMany({
      where,
      orderBy: { id: 'asc' },
      include: prepaidInclude,
    });
  }

  static async markDelivered(
    tx: FinancialTransactionClient,
    id: string,
    data: {
      deliveredAt: Date;
      deliveredById: string;
      deliveryNotes: string | null;
      remainderDebtId: string | null;
    }
  ) {
    return tx.prepaidPurchase.update({
      where: { id },
      data: {
        status: PrepaidPurchaseStatus.DELIVERED,
        deliveredAt: data.deliveredAt,
        deliveredById: data.deliveredById,
        deliveryNotes: data.deliveryNotes,
        remainderDebtId: data.remainderDebtId,
      },
      include: prepaidInclude,
    });
  }

  static async revertDelivery(tx: FinancialTransactionClient, id: string) {
    return tx.prepaidPurchase.update({
      where: { id },
      data: {
        status: PrepaidPurchaseStatus.PENDING,
        deliveredAt: null,
        deliveredById: null,
        deliveryNotes: null,
        remainderDebtId: null,
      },
      include: prepaidInclude,
    });
  }

  static async findDebtForRemainder(debtId: string, tx?: FinancialTransactionClient) {
    const client = tx ?? prisma;
    return client.debt.findUnique({
      where: { id: debtId },
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
        },
      },
    });
  }

  static buildWhere(filters: {
    status: 'ALL' | 'PENDING' | 'DELIVERED' | 'CANCELLED';
    customerId?: string;
    search?: string;
    dateFrom?: Date;
    dateTo?: Date;
  }): Prisma.PrepaidPurchaseWhereInput {
    const debtFilters: Prisma.DebtWhereInput = {
      kind: DebtKind.PREPAID_PURCHASE,
      ...(filters.customerId ? { customerId: filters.customerId } : {}),
      ...(filters.search
        ? {
            OR: [
              { description: { contains: filters.search, mode: 'insensitive' } },
              { customer: { name: { contains: filters.search, mode: 'insensitive' } } },
              { customer: { phone: { contains: filters.search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    return {
      ...(filters.status !== 'ALL'
        ? { status: filters.status as PrepaidPurchaseStatus }
        : {}),
      ...(filters.dateFrom || filters.dateTo
        ? {
            createdAt: {
              ...(filters.dateFrom ? { gte: filters.dateFrom } : {}),
              ...(filters.dateTo ? { lte: filters.dateTo } : {}),
            },
          }
        : {}),
      debt: debtFilters,
    };
  }
}
