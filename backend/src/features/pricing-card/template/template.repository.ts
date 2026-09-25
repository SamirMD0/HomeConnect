import { Prisma } from '@prisma/client';
import { prisma } from '../../../lib/prisma';

export class PricingCardTemplateRepository {
  static list(activeOnly = false) { return prisma.pricingCardTemplate.findMany({ where: activeOnly ? { isActive: true } : undefined, orderBy: [{ name: 'asc' }, { id: 'asc' }] }); }
  static findById(id: string, tx?: Prisma.TransactionClient) { return (tx ?? prisma).pricingCardTemplate.findUnique({ where: { id } }); }
  static findByName(name: string, tx?: Prisma.TransactionClient) { return (tx ?? prisma).pricingCardTemplate.findUnique({ where: { name } }); }
  static create(data: Prisma.PricingCardTemplateUncheckedCreateInput, tx: Prisma.TransactionClient) { return tx.pricingCardTemplate.create({ data }); }
  static update(id: string, data: Prisma.PricingCardTemplateUpdateInput, tx: Prisma.TransactionClient) { return tx.pricingCardTemplate.update({ where: { id }, data }); }
}
