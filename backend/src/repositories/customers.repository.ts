import { prisma } from '../lib/prisma';
import { Prisma } from '@prisma/client';
import { findSearchMatchIds } from '../lib/search-query';

export class CustomersRepository {
  static async findById(id: string) {
    return prisma.customer.findUnique({
      where: { id, deletedAt: null }
    });
  }

  static async findByPhone(phone: string) {
    return prisma.customer.findFirst({
      where: { phone, deletedAt: null }
    });
  }

  static async findAll(params: {
    skip?: number;
    take?: number;
    search?: string;
    sortBy?: 'name' | 'createdAt' | 'updatedAt';
    sortOrder?: 'asc' | 'desc';
  }) {
    const { skip, take, search, sortBy = 'createdAt', sortOrder = 'desc' } = params;

    // Trigram search resolves which customers match; Prisma still owns
    // pagination, sorting and shaping, so results are ordered exactly as before
    // and the match set is a superset of the previous ILIKE behaviour.
    const matchedIds = await findSearchMatchIds('customer', search);

    const where: Prisma.CustomerWhereInput = {
      deletedAt: null,
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

  static async create(data: Prisma.CustomerCreateInput) {
    return prisma.customer.create({
      data
    });
  }

  static async update(id: string, data: Prisma.CustomerUpdateInput) {
    return prisma.customer.update({
      where: { id },
      data
    });
  }

  static async softDelete(id: string) {
    return prisma.customer.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false }
    });
  }
}
