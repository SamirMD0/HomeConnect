export interface ProductPresetUsage {
  presetId: string;
  presetName: string;
  productCount: number;
}

export interface ProductAnalyticsData {
  totals: {
    active: number;
    archived: number;
    missingBarcode: number;
    missingCost: number;
    missingPricing: number;
    ready: number;
    readinessPercent: number;
  };
  presetUsage: ProductPresetUsage[];
}

