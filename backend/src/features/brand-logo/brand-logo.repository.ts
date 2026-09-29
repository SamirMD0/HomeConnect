import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';

export class BrandLogoRepository {
  static list(activeOnly = false) {
    return prisma.brandLogo.findMany({
      where: activeOnly ? { isActive: true } : undefined,
      orderBy: [{ displayName: 'asc' }, { id: 'asc' }],
    });
  }

  static findById(id: string, tx?: Prisma.TransactionClient) {
    return (tx ?? prisma).brandLogo.findUnique({ where: { id } });
  }

  static findByCanonical(canonicalName: string, tx?: Prisma.TransactionClient) {
    return (tx ?? prisma).brandLogo.findUnique({ where: { canonicalName } });
  }

  static create(data: Prisma.BrandLogoUncheckedCreateInput, tx: Prisma.TransactionClient) {
    return tx.brandLogo.create({ data });
  }

  static update(id: string, data: Prisma.BrandLogoUpdateInput, tx: Prisma.TransactionClient) {
    return tx.brandLogo.update({ where: { id }, data });
  }
}
