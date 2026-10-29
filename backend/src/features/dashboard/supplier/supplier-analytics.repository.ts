import { scopeWhere, type BranchScope } from '../../branches/branch-scope';
import { SupplierTransactionStatus, type Prisma } from '@prisma/client';
import { prisma } from '../../../lib/prisma';

const include = {
  supplier: { select: { id: true, name: true, companyName: true, isActive: true } },
} satisfies Prisma.SupplierTransactionInclude;

export type SupplierAnalyticsTransaction = Prisma.SupplierTransactionGetPayload<{ include: typeof include }>;

export class SupplierAnalyticsRepository {
  static async load(includeArchived: boolean, scope: BranchScope): Promise<SupplierAnalyticsTransaction[]> {
    const rows = await prisma.supplierTransaction.findMany({
      where: { ...scopeWhere(scope),
        status: SupplierTransactionStatus.ACTIVE,
        ...(!includeArchived ? { supplier: { isActive: true } } : {}),
      },
      include: {...include, branch:{select:{name:true}}},
      orderBy: [{ transactionDate: 'asc' }, { id: 'asc' }],
    });
    return rows.map(row => ({ ...row, amount: row.baseAmount }));
  }
}

