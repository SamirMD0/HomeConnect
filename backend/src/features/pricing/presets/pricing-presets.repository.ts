import { Prisma } from '@prisma/client';
import { prisma } from '../../../lib/prisma';

export const pricingPresetInclude = {
  createdBy: { select: { fullName: true, username: true } },
  updatedBy: { select: { fullName: true, username: true } },
} satisfies Prisma.PricingPresetInclude;

export class PricingPresetsRepository {
  static findById(id: string, tx?: Prisma.TransactionClient) {
    return (tx ?? prisma).pricingPreset.findUnique({ where: { id }, include: pricingPresetInclude });
  }

  static findActiveDefault(tx?: Prisma.TransactionClient) {
    return (tx ?? prisma).pricingPreset.findFirst({ where: { isDefault: true, isActive: true, archivedAt: null }, include: pricingPresetInclude });
  }

  static findDuplicateName(name: string, excludeId?: string, tx?: Prisma.TransactionClient) {
    return (tx ?? prisma).pricingPreset.findFirst({
      where: { name: { equals: name, mode: 'insensitive' }, archivedAt: null, ...(excludeId ? { id: { not: excludeId } } : {}) },
      select: { id: true },
    });
  }

  static async list(params: PricingPresetListParams) {
    const where: Prisma.PricingPresetWhereInput = {
      ...(params.isActive === undefined ? {} : { isActive: params.isActive }),
      ...(params.productType ? { productType: { equals: params.productType, mode: 'insensitive' } } : {}),
      ...(params.search ? { OR: [
        { name: { contains: params.search, mode: 'insensitive' } },
        { productType: { contains: params.search, mode: 'insensitive' } },
      ] } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.pricingPreset.findMany({ where, include: pricingPresetInclude, skip: params.skip, take: params.take, orderBy: [{ [params.sortBy]: params.sortOrder }, { id: 'asc' }] }),
      prisma.pricingPreset.count({ where }),
    ]);
    return { items, total };
  }

  static create(data: Prisma.PricingPresetUncheckedCreateInput, tx: Prisma.TransactionClient) {
    return tx.pricingPreset.create({ data, include: pricingPresetInclude });
  }

  static update(id: string, data: Prisma.PricingPresetUncheckedUpdateInput, tx: Prisma.TransactionClient) {
    return tx.pricingPreset.update({ where: { id }, data, include: pricingPresetInclude });
  }

  static clearDefault(exceptId: string, tx: Prisma.TransactionClient) {
    return tx.pricingPreset.updateMany({ where: { isDefault: true, id: { not: exceptId } }, data: { isDefault: false } });
  }
}

interface PricingPresetListParams {
  search?: string;
  productType?: string;
  isActive?: boolean;
  sortBy: 'name' | 'productType' | 'createdAt' | 'updatedAt';
  sortOrder: 'asc' | 'desc';
  skip: number;
  take: number;
}
