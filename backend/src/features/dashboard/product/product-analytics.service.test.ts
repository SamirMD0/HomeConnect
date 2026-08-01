import { describe, expect, it } from 'vitest';
import { ProductAnalyticsService } from './product-analytics.service';

describe('ProductAnalyticsService', () => {
  it('calculates readiness and keeps unused presets at zero', () => {
    const records = {
      products: [
        { id: 'p1', isActive: true, barcode: null, costPrice: null, price: null, pricingPresetId: null, useCustomPricing: false },
        { id: 'p2', isActive: true, barcode: 'x', costPrice: { toString: () => '10' }, price: null, pricingPresetId: null, useCustomPricing: true },
      ],
      presets: [{ id: 'r1', name: 'Retail', isActive: true }],
    };
    const result = ProductAnalyticsService.aggregate(records as never);
    expect(result.totals).toMatchObject({ active: 2, missingBarcode: 1, missingCost: 1, missingPricing: 1, ready: 1, readinessPercent: 50 });
    expect(result.presetUsage).toEqual([{ presetId: 'r1', presetName: 'Retail', productCount: 0 }]);
  });
});
