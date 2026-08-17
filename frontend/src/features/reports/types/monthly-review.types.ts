import type { DashboardAlert } from '../../dashboard/types';
import type { InventorySummary } from '../../inventory/types/inventory.types';

export type ReportsPeriodPreset = 'thisMonth' | 'lastMonth' | 'custom' | 'thisWeek' | 'today';

export interface MonthlyReviewQuery {
  period: ReportsPeriodPreset;
  from?: string;
  to?: string;
}

export interface MonthlyReviewMeta {
  from: string;
  to: string;
  previousFrom: string;
  previousTo: string;
  preset: ReportsPeriodPreset;
  generatedAt: string;
  currency: 'USD';
}

export interface MonthlyReviewMovement {
  opening: string;
  newAmount: string;
  collected: string;
  adjustments: string;
  closing: string;
  reconciled: boolean;
}

export interface MonthlyReviewData {
  sales: {
    orderCount: number;
    totalAmount: string;
    paidAmount: string;
    unpaidAmount: string;
    averageOrderValue: string;
    salesByDay: Array<{ date: string; amount: string; orderCount: number }>;
    paymentStatusDistribution: Array<{ status: string; count: number }>;
    fulfillmentStatusDistribution: Array<{ status: string; count: number }>;
    topProducts: Array<{ productId: string; productName: string; quantity: number }>;
  };
  customers: {
    newCustomers: number;
    activeCustomers: number;
    paidCount: number;
    didNotPayCount: number;
    didNotPay: Array<{ id: string; name: string; phone: string }>;
    movement: MonthlyReviewMovement & { withDebt: number; fullyPaid: number; overdue: number };
    operationalSnapshot: {
      generatedAt: string;
      ageDistribution: Array<{ key: string; label: string; amount: string; count: number }>;
      topDebtors: Array<{ customerId: string; customerName: string; phone: string; outstanding: string }>;
    };
  };
  suppliers: {
    movement: MonthlyReviewMovement & { withBalance: number };
    operationalSnapshot: {
      generatedAt: string;
      owed: string;
      suppliersWithBalance: number;
      topBalances: Array<{
        supplierId: string;
        supplierName: string;
        companyName: string | null;
        balance: string;
      }>;
    };
  };
  inventory: {
    operationalSnapshot: { generatedAt: string; summary: InventorySummary };
  };
  risk: {
    alerts: DashboardAlert[];
    total: number;
    operationalSnapshotAt: string;
  };
}

export interface MonthlyReviewResponse {
  success: true;
  meta: MonthlyReviewMeta;
  data: MonthlyReviewData;
}
