import type { DashboardAlertsData } from '../../dashboard/alerts/dashboard-alerts.types';
import type { CustomerAgeBucket, CustomerTopDebtor } from '../../dashboard/customer/customer-analytics.types';
import type { MonthEndData } from '../../dashboard/month-end/month-end.types';
import type { SalesAnalyticsData } from '../../dashboard/sales/sales-analytics.types';
import type { SupplierBalanceItem } from '../../dashboard/supplier/supplier-analytics.types';
import type { ReportsCustomerMetrics, ReportsSalesPeriodMetrics } from '../metrics/reports-metrics.types';
import type { ReportsData, ReportsEnvelope } from '../shared/reports-envelope';

export interface MonthlyReviewSales extends ReportsSalesPeriodMetrics {
  salesByDay: SalesAnalyticsData['salesByDay'];
  paymentStatusDistribution: SalesAnalyticsData['paymentStatusDistribution'];
  fulfillmentStatusDistribution: SalesAnalyticsData['fulfillmentStatusDistribution'];
  topProducts: SalesAnalyticsData['topProducts'];
}

export interface MonthlyReviewCustomers extends ReportsCustomerMetrics {
  movement: MonthEndData['customers'];
  operationalSnapshot: {
    generatedAt: string;
    ageDistribution: CustomerAgeBucket[];
    topDebtors: CustomerTopDebtor[];
  };
}

export interface MonthlyReviewSuppliers {
  movement: MonthEndData['suppliers'];
  operationalSnapshot: {
    generatedAt: string;
    owed: string;
    suppliersWithBalance: number;
    topBalances: SupplierBalanceItem[];
  };
}

export interface MonthlyReviewInventory {
  operationalSnapshot: {
    generatedAt: string;
    summary: Awaited<ReturnType<typeof import('../../inventory/inventory.service').InventoryService.getInventorySummary>>;
  };
}

export interface MonthlyReviewRisk extends DashboardAlertsData {
  operationalSnapshotAt: string;
}

export type MonthlyReviewData = ReportsData<
  MonthlyReviewSales,
  MonthlyReviewCustomers,
  MonthlyReviewSuppliers,
  MonthlyReviewInventory,
  MonthlyReviewRisk
>;

export type MonthlyReviewEnvelope = ReportsEnvelope<MonthlyReviewData>;
