import { prisma, transactionModel, activityLogModel } from '../lib/prisma';

export class TransactionsRepository {
  static async findById(id: string) {
    return transactionModel.findUnique({
      where: { id },
      include: {
        customer: {
          select: { id: true, name: true, phone: true }
        },
        user: {
          select: { id: true, fullName: true, username: true }
        },
        payments: {
          where: { deletedAt: null },
          orderBy: { date: 'asc' }
        }
      }
    });
  }

  static async findAll(params: {
    skip?: number;
    take?: number;
    customerId?: string;
    type?: 'SALE' | 'PAYMENT' | 'ADJUSTMENT';
    startDate?: Date;
    endDate?: Date;
  }) {
    const { skip, take, customerId, type, startDate, endDate } = params;

    const where = {
      deletedAt: null,
      parentId: null,
      ...(customerId ? { customerId } : {}),
      ...(type ? { type } : {}),
      ...(startDate || endDate ? {
        date: {
          ...(startDate ? { gte: startDate } : {}),
          ...(endDate ? { lte: endDate } : {})
        }
      } : {})
    };

    const [transactions, total] = await Promise.all([
      transactionModel.findMany({
        where,
        skip,
        take,
        orderBy: { date: 'desc' },
        include: {
          customer: { select: { id: true, name: true, phone: true } },
          user: { select: { id: true, fullName: true, username: true } },
          payments: {
            where: { deletedAt: null },
            orderBy: { date: 'asc' },
            include: { user: { select: { fullName: true } } }
          }
        }
      }),
      transactionModel.count({ where })
    ]);

    return { transactions, total };
  }

  static async findByCustomer(customerId: string) {
    return transactionModel.findMany({
      where: { customerId, deletedAt: null, parentId: null },
      orderBy: { date: 'asc' },
      include: {
        user: { select: { id: true, fullName: true } },
        payments: {
          where: { deletedAt: null },
          orderBy: { date: 'asc' },
          include: { user: { select: { fullName: true } } }
        }
      }
    });
  }

  static async calculateCustomerBalance(customerId: string): Promise<number> {
    const aggregations = await transactionModel.groupBy({
      by: ['type'],
      _sum: {
        amount: true
      },
      where: {
        customerId,
        deletedAt: null
      }
    });

    let balance = 0;

    for (const agg of aggregations) {
      const amount = Number(agg._sum.amount || 0);
      if (agg.type === 'SALE') {
        balance += amount;
      } else if (agg.type === 'PAYMENT') {
        balance -= amount;
      } else if (agg.type === 'ADJUSTMENT') {
        balance += amount;
      }
    }

    return balance;
  }

  static async create(data: {
    id?: string;
    customerId: string;
    type: 'SALE' | 'PAYMENT' | 'ADJUSTMENT';
    amount: number | string;
    description: string;
    date?: Date;
    dueDate?: Date | null;
    createdBy: string;
    referenceNumber?: string;
    metadata?: any;
    branchId?: string;
    parentId?: string | null;
  }, activityLogData: {
    userId: string;
    action: string;
    entityType: string;
    entityId: string;
    details: any;
    ipAddress?: string;
    branchId?: string;
  }) {
    return prisma.$transaction(async (tx) => {
      const p = tx as any;
      const txRecord = await p.transaction.create({ data });
      await p.activityLog.create({ data: activityLogData });
      return txRecord;
    });
  }

  static async update(
    id: string,
    data: {
      amount?: number | string;
      description?: string;
      dueDate?: Date | null;
      date?: Date;
      referenceNumber?: string | null;
      metadata?: any;
    },
    activityLogData: {
      userId: string;
      action: string;
      entityType: string;
      entityId: string;
      details: any;
      ipAddress?: string;
      branchId?: string;
    }
  ) {
    return prisma.$transaction(async (tx) => {
      const p = tx as any;
      const txRecord = await p.transaction.update({ where: { id }, data });
      await p.activityLog.create({ data: activityLogData });
      return txRecord;
    });
  }

  static async softDelete(
    id: string,
    activityLogData: {
      userId: string;
      action: string;
      entityType: string;
      entityId: string;
      details: any;
      ipAddress?: string;
      branchId?: string;
    }
  ) {
    return prisma.$transaction(async (tx) => {
      const p = tx as any;
      const txRecord = await p.transaction.update({
        where: { id },
        data: { deletedAt: new Date() }
      });
      await p.activityLog.create({ data: activityLogData });
      return txRecord;
    });
  }
}
