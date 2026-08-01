import { SupplierTransactionStatus } from '@prisma/client';
import { prisma } from '../../../lib/prisma';

export class MonthEndRepository {
  static async loadOperationalRecords() {
    const [supplierTransactions, serviceJobs] = await Promise.all([
      prisma.supplierTransaction.findMany({
        where: { status: SupplierTransactionStatus.ACTIVE },
        select: {
          id: true,
          supplierId: true,
          type: true,
          direction: true,
          amount: true,
          transactionDate: true,
          supplier: { select: { isActive: true } },
        },
      }),
      prisma.serviceJob.findMany({
        select: {
          id: true,
          status: true,
          serviceCreatedDate: true,
          completedAt: true,
          cancelledAt: true,
        },
      }),
    ]);
    return { supplierTransactions, serviceJobs };
  }
}

export type MonthEndOperationalRecords = Awaited<ReturnType<typeof MonthEndRepository.loadOperationalRecords>>;

