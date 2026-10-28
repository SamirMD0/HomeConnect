import { scopeWhere, type BranchScope } from '../features/branches/branch-scope';
import { prisma } from '../lib/prisma';
import { Prisma } from '@prisma/client';
import { findSearchMatchIds } from '../lib/search-query';

export class CustomersRepository {
  static async findById(id: string, scope: BranchScope, tx?: Prisma.TransactionClient) {
    return (tx ?? prisma).customer.findUnique({
      where: { id, deletedAt: null, ...scopeWhere(scope) }
    });
  }

  static async findByPhone(phone: string, branchId: string, tx?: Prisma.TransactionClient) {
    return (tx ?? prisma).customer.findFirst({
      where: { phone, branchId, deletedAt: null }
    });
  }

  static async findAll(params: {
    skip?: number;
    take?: number;
    search?: string;
    sortBy?: 'name' | 'createdAt' | 'updatedAt';
    sortOrder?: 'asc' | 'desc';
  }, scope: BranchScope) {
    const { skip, take, search, sortBy = 'createdAt', sortOrder = 'desc' } = params;

    // Trigram search resolves which customers match; Prisma still owns
    // pagination, sorting and shaping, so results are ordered exactly as before
    // and the match set is a superset of the previous ILIKE behaviour.
    const matchedIds = await findSearchMatchIds('customer', search, undefined, scope);

    const where: Prisma.CustomerWhereInput = {
      deletedAt: null,
      ...scopeWhere(scope),
      ...(matchedIds ? { id: { in: matchedIds } } : {})
    };

    const [customers, total] = await Promise.all([
      prisma.customer.findMany({
        where,
        skip,
        take,
        orderBy: { [sortBy]: sortOrder }
      }),
      prisma.customer.count({ where })
    ]);

    return { customers, total };
  }

  static async create(data: Prisma.CustomerUncheckedCreateInput, tx: Prisma.TransactionClient) {
    return tx.customer.create({
      data
    });
  }

  static async update(id: string, data: Prisma.CustomerUpdateInput, scope: BranchScope, tx: Prisma.TransactionClient) {
    return tx.customer.update({
      where: { id, ...scopeWhere(scope) },
      data
    });
  }

  static async softDelete(id: string, scope: BranchScope, tx: Prisma.TransactionClient) {
    return tx.customer.update({
      where: { id, ...scopeWhere(scope) },
      data: { deletedAt: new Date(), isActive: false }
    });
  }
}
