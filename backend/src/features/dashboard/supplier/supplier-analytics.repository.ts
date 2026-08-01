import { SupplierTransactionStatus, type Prisma } from '@prisma/client';
import { prisma } from '../../../lib/prisma';

const include = {
  supplier: { select: { id: true, name: true, companyName: true, isActive: true } },
} satisfies Prisma.SupplierTransactionInclude;

export type SupplierAnalyticsTransaction = Prisma.SupplierTransactionGetPayload<{ include: typeof include }>;

export class SupplierAnalyticsRepository {
  static load(includeArchived: boolean): Promise<SupplierAnalyticsTransaction[]> {
    return prisma.supplierTransaction.findMany({
      where: {
        status: SupplierTransactionStatus.ACTIVE,
        ...(!includeArchived ? { supplier: { isActive: true } } : {}),
      },
      include,
      orderBy: [{ transactionDate: 'asc' }, { id: 'asc' }],
    });
  }
}

