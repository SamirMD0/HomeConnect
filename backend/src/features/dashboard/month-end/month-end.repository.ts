import { scopeWhere, type BranchScope } from '../../branches/branch-scope';
import { SupplierTransactionStatus } from '@prisma/client';
import { prisma } from '../../../lib/prisma';

export class MonthEndRepository {
  static async loadOperationalRecords(scope: BranchScope) {
    const [supplierTransactions, serviceJobs] = await Promise.all([
      prisma.supplierTransaction.findMany({
        where: { ...scopeWhere(scope),  status: SupplierTransactionStatus.ACTIVE },
        select: {
          id: true,
          supplierId: true,
          type: true,
          direction: true,
          amount: true, baseAmount: true,
          transactionDate: true,
          supplier: { select: { isActive: true } },
        },
      }),
      prisma.serviceJob.findMany({ where: scopeWhere(scope),
        select: {
          id: true,
          status: true,
          serviceCreatedDate: true,
          completedAt: true,
          cancelledAt: true,
        },
      }),
    ]);
    return { supplierTransactions: supplierTransactions.map(row => ({ ...row, amount: row.baseAmount })), serviceJobs };
  }
}

export type MonthEndOperationalRecords = Awaited<ReturnType<typeof MonthEndRepository.loadOperationalRecords>>;

