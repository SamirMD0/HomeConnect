import { prisma } from '../../../lib/prisma';

export class ProductAnalyticsRepository {
  static async load() {
    const [products, presets] = await Promise.all([
      prisma.product.findMany({
        select: {
          id: true,
          name: true,
          model: true,
          isActive: true,
          barcode: true,
          costPrice: true,
          price: true,
          pricingPresetId: true,
          useCustomPricing: true,
        },
      }),
      prisma.pricingPreset.findMany({
        select: { id: true, name: true, isActive: true },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
      }),
    ]);
    return { products, presets };
  }
}

export type ProductAnalyticsRecords = Awaited<ReturnType<typeof ProductAnalyticsRepository.load>>;
