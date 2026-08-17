/** Named values for every deterministic risk rule in the Reports plan. */
export const REPORTS_RISK_THRESHOLDS = Object.freeze({
  debtOutrunningSalesGrowthGapPercent: 0,
  collectionShortfallConsecutiveMonths: 2,
  supplierSqueezeGrowthGapPercent: 0,
  customerReceivableConcentrationPercent: 25,
  fastMovingStockoutQuantityOffsetFromLowStockThreshold: 0,
  deadStockMinimumQuantity: 1,
  deadStockMaximumSaleFulfillmentMovements: 0,
  receivingMinimumPurchaseReceiptCoveragePercent: 100,
} as const);
