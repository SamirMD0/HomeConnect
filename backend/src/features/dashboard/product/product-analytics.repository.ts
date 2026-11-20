import { prisma } from '../../../lib/prisma';
import { sharedLoad } from '../shared/shared-load';

export class ProductAnalyticsRepository {
  /** Products are shop-wide, so every branch and card shares one read. */
  static load() {
    return sharedLoad('product-analytics', [], () => this.read());
  }

  private static async read() {
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
