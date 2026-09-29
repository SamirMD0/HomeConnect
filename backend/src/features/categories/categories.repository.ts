import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { categoryInclude } from './category-hierarchy';

export class CategoriesRepository {
  static list(tx?: Prisma.TransactionClient) {
    return (tx ?? prisma).category.findMany({
      include: { ...categoryInclude, _count: { select: { products: true, children: true } } },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
  }
  static find(id: string, tx?: Prisma.TransactionClient) {
    return (tx ?? prisma).category.findUnique({
      where: { id },
      include: { ...categoryInclude, _count: { select: { products: true, children: true } } },
    });
  }
  static create(data: Prisma.CategoryUncheckedCreateInput, tx: Prisma.TransactionClient) {
    return tx.category.create({ data, include: categoryInclude });
  }
  static update(
    id: string,
    data: Prisma.CategoryUncheckedUpdateInput,
    tx: Prisma.TransactionClient
  ) {
    return tx.category.update({ where: { id }, data, include: categoryInclude });
  }
  static remove(id: string, tx: Prisma.TransactionClient) {
    return tx.category.delete({ where: { id } });
  }
}
