import { Prisma } from '@prisma/client';
import { prisma } from '../../../lib/prisma';

export class FeatureIconRepository {
  static list(options: { activeOnly?: boolean; category?: string }) {
    return prisma.pricingCardFeatureIcon.findMany({
      where: { ...(options.activeOnly ? { isActive: true } : {}), ...(options.category ? { category: options.category } : {}) },
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }, { id: 'asc' }],
    });
  }
  static findById(id: string, tx?: Prisma.TransactionClient) { return (tx ?? prisma).pricingCardFeatureIcon.findUnique({ where: { id } }); }
  static getByCode(code: string, tx?: Prisma.TransactionClient) { return (tx ?? prisma).pricingCardFeatureIcon.findUnique({ where: { code } }); }
  static create(data: Prisma.PricingCardFeatureIconUncheckedCreateInput, tx: Prisma.TransactionClient) { return tx.pricingCardFeatureIcon.create({ data }); }
  static update(id: string, data: Prisma.PricingCardFeatureIconUpdateInput, tx: Prisma.TransactionClient) { return tx.pricingCardFeatureIcon.update({ where: { id }, data }); }
}
