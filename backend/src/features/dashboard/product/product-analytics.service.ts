import { ProductAnalyticsRepository, type ProductAnalyticsRecords } from './product-analytics.repository';
import type { ProductAnalyticsData } from './product-analytics.types';

export class ProductAnalyticsService {
  static async get(): Promise<ProductAnalyticsData> {
    return this.aggregate(await ProductAnalyticsRepository.load());
  }

  static aggregate(records: ProductAnalyticsRecords): ProductAnalyticsData {
    const active = records.products.filter((product) => product.isActive);
    const missingPricing = active.filter(
      (product) => !product.useCustomPricing && !product.pricingPresetId
    );
    const ready = active.filter(
      (product) =>
        Boolean(product.barcode) &&
        Boolean(product.costPrice) &&
        (product.useCustomPricing || Boolean(product.pricingPresetId))
    );
    return {
      totals: {
        active: active.length,
        archived: records.products.length - active.length,
        missingBarcode: active.filter((product) => !product.barcode).length,
        missingCost: active.filter((product) => !product.costPrice).length,
        missingPricing: missingPricing.length,
        ready: ready.length,
        readinessPercent: active.length === 0 ? 100 : Math.round((ready.length / active.length) * 100),
      },
      presetUsage: records.presets.map((preset) => ({
        presetId: preset.id,
        presetName: preset.name,
        productCount: active.filter((product) => product.pricingPresetId === preset.id).length,
      })),
    };
  }
}

