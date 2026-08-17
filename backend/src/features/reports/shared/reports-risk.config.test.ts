import { describe, expect, it } from 'vitest';
import { REPORTS_RISK_THRESHOLDS } from './reports-risk.config';

describe('REPORTS_RISK_THRESHOLDS', () => {
  it('centralizes every threshold named by the Reports risk design', () => {
    expect(REPORTS_RISK_THRESHOLDS).toEqual({
      debtOutrunningSalesGrowthGapPercent: 0,
      collectionShortfallConsecutiveMonths: 2,
      supplierSqueezeGrowthGapPercent: 0,
      customerReceivableConcentrationPercent: 25,
      fastMovingStockoutQuantityOffsetFromLowStockThreshold: 0,
      deadStockMinimumQuantity: 1,
      deadStockMaximumSaleFulfillmentMovements: 0,
      receivingMinimumPurchaseReceiptCoveragePercent: 100,
    });
    expect(Object.isFrozen(REPORTS_RISK_THRESHOLDS)).toBe(true);
  });
});
