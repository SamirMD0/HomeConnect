import type { MonthlyReviewMeta } from './monthly-review.types';

export type AnalysisSeverity = 'info' | 'warning' | 'serious';

export interface AnalysisFinding {
  key: string;
  severity: AnalysisSeverity;
  label: { en: string; ar: string };
  detail: { en: string; ar: string };
}

export interface AnalysisComparison {
  current: string;
  previous: string;
  change: string;
  changePercent: number | null;
}

export interface AnalysisCountComparison {
  current: number;
  previous: number;
  change: number;
}

export interface AnalysisData {
  health: {
    salesTotal: AnalysisComparison;
    orderCount: AnalysisCountComparison;
    customerDebtAdded: AnalysisComparison;
    customerCollected: AnalysisComparison;
    supplierDebtAdded: AnalysisComparison;
    supplierPaid: AnalysisComparison;
    customerReceivables: AnalysisComparison;
    supplierPayables: AnalysisComparison;
    inventoryReceivedUnits: AnalysisCountComparison;
    inventorySoldUnits: AnalysisCountComparison;
  };
  cashflow: {
    customerDebtGrowth: string;
    supplierDebtGrowth: string;
    collections: string;
    supplierPayments: string;
    netCollectionPosition: string;
    unpaidCustomerAmount: string;
    supplierAmountOwed: string;
    supplierDebtOutrunningCollections: boolean;
    collectionShortfall: boolean;
  };
  salesVsDebt: {
    orderCount: number;
    paidAmount: string;
    unpaidAmount: string;
    unpaidPercentOfSales: number | null;
    topDebtors: Array<{ customerId: string; customerName: string; outstanding: string }>;
  };
  supplierPosition: {
    owed: string;
    suppliersWithBalance: number;
    paidInPeriod: string;
    topBalances: Array<{ supplierId: string; supplierName: string; balance: string }>;
    receivingWithoutLinkedDebt: number;
  };
  inventoryPosition: {
    receivedUnits: number;
    receivedLines: number;
    soldUnits: number;
    lowStockProducts: number;
    outOfStockProducts: number;
    receivedNotSoldProducts: number;
    ordersAwaitingStockDeduction: number;
  };
  findings: AnalysisFinding[];
}

export interface AnalysisEnvelope {
  meta: MonthlyReviewMeta;
  data: AnalysisData;
}
