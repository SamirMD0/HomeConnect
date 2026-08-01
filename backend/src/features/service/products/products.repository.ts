import { Prisma } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { serviceJobInclude } from '../service-jobs/service-jobs.repository';

const productActorInclude = {
  createdBy: { select: { fullName: true, username: true } },
  updatedBy: { select: { fullName: true, username: true } },
  pricingPreset: true,
  // Metadata only — never select `data`, or every product query would load image payloads.
  image: { select: { mimeType: true, byteSize: true, updatedAt: true } },
} satisfies Prisma.ProductInclude;

export class ProductsRepository {
  static findById(id: string, tx?: Prisma.TransactionClient) {
    return (tx ?? prisma).product.findUnique({ where: { id }, include: productActorInclude });
  }

  static findByBarcode(barcode: string, tx?: Prisma.TransactionClient) {
    return (tx ?? prisma).product.findUnique({ where: { barcode } });
  }

  static findBySku(sku: string, tx?: Prisma.TransactionClient) {
    return (tx ?? prisma).product.findUnique({ where: { sku } });
  }

  static async list(params: {
    search?: string;
    isActive?: boolean;
    brand?: string;
    hasBarcode?: boolean;
    sortBy: 'name' | 'model' | 'brand' | 'price' | 'createdAt' | 'updatedAt';
    sortOrder: 'asc' | 'desc';
    skip: number;
    take: number;
  }) {
    const where: Prisma.ProductWhereInput = {
      ...(params.isActive === undefined ? {} : { isActive: params.isActive }),
      ...(params.brand ? { brand: { equals: params.brand, mode: 'insensitive' } } : {}),
      ...(params.hasBarcode === undefined ? {} : params.hasBarcode ? { barcode: { not: null } } : { barcode: null }),
      ...(params.search
        ? {
            OR: [
              { name: { contains: params.search, mode: 'insensitive' } },
              { sku: { contains: params.search, mode: 'insensitive' } },
              { model: { contains: params.search, mode: 'insensitive' } },
              { brand: { contains: params.search, mode: 'insensitive' } },
              { barcode: { startsWith: params.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [exact, total] = await Promise.all([
      params.search && params.skip === 0 ? prisma.product.findFirst({
        where: {
          AND: [where, { OR: [
            { sku: { equals: params.search, mode: 'insensitive' } },
            { barcode: { equals: params.search, mode: 'insensitive' } },
          ] }],
        },
        include: productActorInclude,
      }) : Promise.resolve(null),
      prisma.product.count({ where }),
    ]);
    const remaining = await prisma.product.findMany({
      where: exact ? { AND: [where, { id: { not: exact.id } }] } : where,
      include: productActorInclude,
      skip: params.skip,
      take: Math.max(0, params.take - (exact ? 1 : 0)),
      orderBy: [{ [params.sortBy]: params.sortOrder }, { id: 'asc' }],
    });
    const items = exact ? [exact, ...remaining] : remaining;
    return { items, total };
  }

  static findDuplicates(name: string, model: string, brand?: string | null) {
    return prisma.product.findMany({
      where: {
        name: { equals: name, mode: 'insensitive' },
        model: { equals: model, mode: 'insensitive' },
        ...(brand ? { brand: { equals: brand, mode: 'insensitive' } } : {}),
      },
      select: { id: true, name: true, model: true, brand: true, isActive: true },
      orderBy: [{ isActive: 'desc' }, { updatedAt: 'desc' }, { id: 'asc' }],
      take: 5,
    });
  }

  static async serviceJobs(productId: string, skip: number, take: number) {
    const where: Prisma.ServiceJobWhereInput = { productId };
    const [items, total] = await Promise.all([
      prisma.serviceJob.findMany({
        where,
        include: serviceJobInclude,
        orderBy: [{ serviceCreatedDate: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
        skip,
        take,
      }),
      prisma.serviceJob.count({ where }),
    ]);
    return { items, total };
  }

  static create(data: Prisma.ProductUncheckedCreateInput, tx: Prisma.TransactionClient) {
    return tx.product.create({ data, include: productActorInclude });
  }

  static update(id: string, data: Prisma.ProductUncheckedUpdateInput, tx: Prisma.TransactionClient) {
    return tx.product.update({ where: { id }, data, include: productActorInclude });
  }

  static findActiveDefaultPricingPreset(tx?: Prisma.TransactionClient) {
    return (tx ?? prisma).pricingPreset.findFirst({ where: { isDefault: true, isActive: true, archivedAt: null } });
  }

  static findPricingPreset(id: string, tx?: Prisma.TransactionClient) {
    return (tx ?? prisma).pricingPreset.findUnique({ where: { id } });
  }

  /** The only query that loads image bytes. */
  static findImageBytes(productId: string, tx?: Prisma.TransactionClient) {
    return (tx ?? prisma).productImage.findUnique({
      where: { productId },
      select: { data: true, mimeType: true, byteSize: true, updatedAt: true },
    });
  }

  static upsertImage(
    productId: string,
    image: { data: Buffer; mimeType: string; byteSize: number },
    tx: Prisma.TransactionClient
  ) {
    return tx.productImage.upsert({
      where: { productId },
      create: { productId, ...image },
      update: image,
      select: { mimeType: true, byteSize: true, updatedAt: true },
    });
  }

  static async deleteImage(productId: string, tx: Prisma.TransactionClient) {
    await tx.productImage.deleteMany({ where: { productId } });
  }
}
