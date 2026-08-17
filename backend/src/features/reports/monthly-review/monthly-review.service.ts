import { DashboardAlertsService } from '../../dashboard/alerts/dashboard-alerts.service';
import { CustomerAnalyticsService } from '../../dashboard/customer/customer-analytics.service';
import { MonthEndService } from '../../dashboard/month-end/month-end.service';
import { SalesAnalyticsService } from '../../dashboard/sales/sales-analytics.service';
import { resolveDashboardRange } from '../../dashboard/shared/dashboard-range';
import { SupplierAnalyticsService } from '../../dashboard/supplier/supplier-analytics.service';
import { todayInBusinessTimezone } from '../../financial';
import { InventoryService } from '../../inventory/inventory.service';
import { ReportsMetricsService } from '../metrics/reports-metrics.service';
import { resolveReportsPeriod } from '../shared/reports-period';
import { buildCsv } from '../shared/csv';
import type { MonthlyReviewEnvelope } from './monthly-review.types';
import type { MonthlyReviewQueryInput } from './monthly-review.validator';

interface MonthlyReviewOptions {
  businessDate?: string;
  generatedAt?: Date;
}

export class MonthlyReviewService {
  static async get(
    query: MonthlyReviewQueryInput,
    options: MonthlyReviewOptions = {}
  ): Promise<MonthlyReviewEnvelope> {
    const businessDate = options.businessDate ?? todayInBusinessTimezone();
    const generatedAt = (options.generatedAt ?? new Date()).toISOString();
    const period = resolveReportsPeriod(query, businessDate);
    const dashboardRange = resolveDashboardRange({
      range: 'custom',
      from: period.from,
      to: period.to,
      includeArchived: false,
    }, businessDate);

    const [monthEnd, metrics, customer, supplier, sales, inventory, risk] = await Promise.all([
      MonthEndService.get({ from: period.from, to: period.to }),
      ReportsMetricsService.get(period),
      CustomerAnalyticsService.get(dashboardRange, {
        includeArchived: false,
        includeAdminData: true,
        businessDate,
      }),
      SupplierAnalyticsService.get(dashboardRange, false, businessDate),
      SalesAnalyticsService.get(dashboardRange, businessDate),
      InventoryService.getInventorySummary(),
      DashboardAlertsService.get(dashboardRange, {
        includeArchived: false,
        includeAdminData: true,
        businessDate,
      }),
    ]);

    return {
      meta: {
        from: period.from,
        to: period.to,
        previousFrom: period.previousFrom,
        previousTo: period.previousTo,
        preset: period.preset,
        generatedAt,
        currency: 'USD',
      },
      data: {
        sales: {
          ...metrics.sales,
          salesByDay: sales.salesByDay,
          paymentStatusDistribution: sales.paymentStatusDistribution,
          fulfillmentStatusDistribution: sales.fulfillmentStatusDistribution,
          topProducts: sales.topProducts,
        },
        customers: {
          ...metrics.customers,
          movement: monthEnd.customers,
          operationalSnapshot: {
            generatedAt,
            ageDistribution: customer.ageDistribution,
            topDebtors: customer.topDebtors ?? [],
          },
        },
        suppliers: {
          movement: monthEnd.suppliers,
          operationalSnapshot: {
            generatedAt,
            owed: supplier.totals.owed,
            suppliersWithBalance: supplier.totals.suppliersWithBalance,
            topBalances: supplier.topBalances,
          },
        },
        inventory: { operationalSnapshot: { generatedAt, summary: inventory } },
        risk: { ...risk, operationalSnapshotAt: generatedAt },
      },
    };
  }

  static async exportCsv(query: MonthlyReviewQueryInput, options: MonthlyReviewOptions = {}) {
    const report = await this.get(query, options);
    const { sales, customers, suppliers, inventory, risk } = report.data;
    const rows = [
      ['Sales', 'Orders', sales.orderCount],
      ['Sales', 'Total sales', sales.totalAmount],
      ['Sales', 'Paid', sales.paidAmount],
      ['Sales', 'Unpaid', sales.unpaidAmount],
      ['Sales', 'Average order value', sales.averageOrderValue],
      ['Customers', 'New customers', customers.newCustomers],
      ['Customers', 'Opening receivable', customers.movement.opening],
      ['Customers', 'New debt', customers.movement.newAmount],
      ['Customers', 'Collected', customers.movement.collected],
      ['Customers', 'Adjustments', customers.movement.adjustments],
      ['Customers', 'Closing receivable', customers.movement.closing],
      ['Suppliers', 'Opening payable', suppliers.movement.opening],
      ['Suppliers', 'New debt', suppliers.movement.newAmount],
      ['Suppliers', 'Paid or credited', suppliers.movement.collected],
      ['Suppliers', 'Adjustments', suppliers.movement.adjustments],
      ['Suppliers', 'Closing payable', suppliers.movement.closing],
      ['Inventory', 'Tracked products', inventory.operationalSnapshot.summary.trackedProducts],
      ['Inventory', 'Low stock products', inventory.operationalSnapshot.summary.lowStockProducts],
      ['Inventory', 'Out of stock products', inventory.operationalSnapshot.summary.outOfStockProducts],
      ['Risk', 'Findings', risk.total],
    ];
    return {
      filename: `monthly-review-${report.meta.from}-to-${report.meta.to}.csv`,
      csv: buildCsv(['Domain', 'Metric', 'Value'], rows),
    };
  }
}
