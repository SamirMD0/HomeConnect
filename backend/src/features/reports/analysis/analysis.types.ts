import type { ReportsMeta } from '../shared/reports-envelope';

export type AnalysisSeverity = 'info' | 'warning' | 'serious';

export interface AnalysisFinding {
  key: string;
  severity: AnalysisSeverity;
  label: { en: string; ar: string };
  detail: { en: string; ar: string };
}

/** A figure alongside the same figure last period, and the movement between them. */
export interface AnalysisComparison {
  current: string;
  previous: string;
  change: string;
  /** Null when the previous period was zero — a percentage would be meaningless. */
  changePercent: number | null;
}

export interface AnalysisData {
  health: {
    salesTotal: AnalysisComparison;
    orderCount: { current: number; previous: number; change: number };
    customerDebtAdded: AnalysisComparison;
    customerCollected: AnalysisComparison;
    supplierDebtAdded: AnalysisComparison;
    supplierPaid: AnalysisComparison;
    customerReceivables: AnalysisComparison;
    supplierPayables: AnalysisComparison;
    inventoryReceivedUnits: { current: number; previous: number; change: number };
    inventorySoldUnits: { current: number; previous: number; change: number };
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
  meta: ReportsMeta;
  data: AnalysisData;
}
