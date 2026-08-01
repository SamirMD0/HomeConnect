import type { ResolvedDashboardRange } from '../dashboard.types';
import { CustomerAnalyticsService } from '../customer/customer-analytics.service';
import { ProductAnalyticsService } from '../product/product-analytics.service';
import { ServiceAnalyticsService } from '../service/service-analytics.service';
import { SupplierAnalyticsService } from '../supplier/supplier-analytics.service';
import type { DashboardOverviewData } from './dashboard-overview.types';

export class DashboardOverviewService {
  static async get(
    range: ResolvedDashboardRange,
    options: { includeArchived: boolean; businessDate: string }
  ): Promise<DashboardOverviewData> {
    const [customer, supplier, service, product] = await Promise.all([
      CustomerAnalyticsService.get(range, { includeArchived: options.includeArchived, includeAdminData: false, businessDate: options.businessDate }),
      SupplierAnalyticsService.get(range, options.includeArchived, options.businessDate),
      ServiceAnalyticsService.get(range, options.businessDate),
      ProductAnalyticsService.get(),
    ]);
    const paymentSparkline = customer.trend.map((point) => ({ bucket: point.bucket, value: point.collected }));
    const debtSparkline = customer.trend.map((point) => ({ bucket: point.bucket, value: point.newDebt }));
    const supplierSparkline = supplier.trend.map((point) => ({ bucket: point.bucket, value: point.paid }));
    const emptySparkline: Array<{ bucket: string; value: number }> = [];
    return {
      kpis: [
        { key: 'collectedToday', value: customer.today.collected, valueKind: 'money', goodDirection: 'up', route: '/ledger?view=payments&range=today', sparkline: paymentSparkline },
        { key: 'customersPaidToday', value: customer.today.distinctPayers, valueKind: 'count', goodDirection: 'up', route: '/ledger?view=payments&range=today', sparkline: paymentSparkline.map((point) => ({ ...point, value: 0 })) },
        { key: 'newDebtsToday', value: customer.today.newDebt, valueKind: 'money', goodDirection: 'neutral', route: '/receivables', sparkline: debtSparkline },
        { key: 'outstandingDebt', value: customer.totals.outstanding, valueKind: 'money', goodDirection: 'down', route: '/receivables', sparkline: debtSparkline },
        { key: 'owedToSuppliers', value: supplier.totals.owed, valueKind: 'money', goodDirection: 'down', route: '/supplier-ledger', sparkline: supplierSparkline },
        { key: 'openServiceJobs', value: service.totals.open, valueKind: 'count', goodDirection: 'neutral', route: '/service?view=open', sparkline: emptySparkline },
        { key: 'readyForPickup', value: service.totals.readyForPickup, valueKind: 'count', goodDirection: 'neutral', route: '/service?status=READY_FOR_PICKUP', sparkline: emptySparkline },
        { key: 'activeProducts', value: product.totals.active, valueKind: 'count', goodDirection: 'neutral', route: '/products', sparkline: emptySparkline },
      ],
      moduleCounts: {
        customers: customer.totals.totalCustomers,
        debts: customer.totals.customersWithBalance,
        suppliers: supplier.totals.suppliersWithBalance,
        products: product.totals.active,
        service: service.totals.all,
      },
    };
  }
}
