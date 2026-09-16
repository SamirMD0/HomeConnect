import { ServiceJobStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { moneyToApiString, prismaDateToBusinessDate, sumMoney, todayInBusinessTimezone } from '../../financial';
import { CustomerAnalyticsService } from '../customer/customer-analytics.service';
import { DASHBOARD_ALERT_THRESHOLDS } from '../dashboard.config';
import type { ResolvedDashboardRange } from '../dashboard.types';
import { ProductAnalyticsRepository } from '../product/product-analytics.repository';
import { differenceInDays } from '../shared/dashboard-range';
import { ServiceAnalyticsRepository } from '../service/service-analytics.repository';
import { ServiceAnalyticsService } from '../service/service-analytics.service';
import { SupplierAnalyticsService } from '../supplier/supplier-analytics.service';
import { SupplierPayablesService } from '../../suppliers/payables/supplier-payables.service';
import type { DashboardAlert, DashboardAlertsData } from './dashboard-alerts.types';

export class DashboardAlertsService {
  static async get(
    range: ResolvedDashboardRange,
    options: { includeArchived: boolean; includeAdminData: boolean; businessDate?: string }
  ): Promise<DashboardAlertsData> {
    const businessDate = options.businessDate ?? todayInBusinessTimezone();
    const [customer, supplier, service, productRecords, serviceJobs, payables] = await Promise.all([
      CustomerAnalyticsService.get(range, { ...options, businessDate }),
      SupplierAnalyticsService.get(range, options.includeArchived, businessDate),
      ServiceAnalyticsService.get(range, businessDate),
      ProductAnalyticsRepository.load(),
      ServiceAnalyticsRepository.load(),
      options.includeAdminData ? SupplierPayablesService.get(businessDate) : Promise.resolve(null),
    ]);
    const alerts: DashboardAlert[] = [];
    const overdueAmount = sumMoney(
      customer.ageDistribution.slice(1).map((bucket) => bucket.amount)
    );
    push(alerts, {
      key: 'overdue-customer-debts', severity: 'critical',
      label: { en: 'Overdue customer debts', ar: 'ديون الزبائن المتأخرة' },
      count: customer.totals.overdueCustomers, amount: moneyToApiString(overdueAmount),
      route: '/receivables?standing=overdue',
      offenders: options.includeAdminData ? (customer.topDebtors ?? []).slice(0, 3).map((row) => ({ id: row.customerId, label: row.customerName, amount: row.outstanding, route: `/customers/${row.customerId}` })) : [],
    });
    const large = (customer.topDebtors ?? []).filter((row) => new Decimal(row.outstanding).greaterThanOrEqualTo(DASHBOARD_ALERT_THRESHOLDS.largeCustomerBalance));
    if (options.includeAdminData) push(alerts, {
      key: 'large-customer-balances', severity: 'serious',
      label: { en: 'Large unpaid balances', ar: 'أرصدة كبيرة غير مدفوعة' },
      count: large.length, amount: moneyToApiString(sumMoney(large.map((row) => row.outstanding))), route: '/receivables',
      offenders: large.slice(0, 3).map((row) => ({ id: row.customerId, label: row.customerName, amount: row.outstanding, route: `/customers/${row.customerId}` })),
    });
    push(alerts, {
      key: 'supplier-balances', severity: 'warning', label: { en: 'Suppliers awaiting payment', ar: 'مورّدون بانتظار الدفع' },
      count: supplier.totals.suppliersWithBalance, amount: supplier.totals.owed, route: '/supplier-ledger',
      offenders: supplier.topBalances.slice(0, 3).map((row) => ({ id: row.supplierId, label: row.supplierName, amount: row.balance, route: `/suppliers/${row.supplierId}` })),
    });
    if (payables) {
      const overdue = payables.rows.filter((r) => r.status === 'OVERDUE');
      push(alerts, {
        key: 'overdue-supplier-payables', severity: 'critical',
        label: { en: 'Overdue supplier payables', ar: 'مستحقات الموردين المتأخرة' },
        count: payables.summary.overdueCount, amount: payables.summary.totalOverdue,
        route: '/reports/supplier-aging',
        offenders: overdue.slice(0, 3).map((r, index) => ({ id: r.id, label: `${index === 0 ? 'Oldest overdue / أقدم مستحق · ' : ''}${r.supplier.name} · ${r.dueDate} · ${r.daysOverdue} days overdue`, amount: r.remainingAmount, route: `/suppliers/${r.supplier.id}` })),
      });
      push(alerts, {
        key: 'supplier-payables-due-soon', severity: 'warning',
        label: { en: `Supplier payables due within ${payables.summary.dueSoonDays} days`, ar: `مستحقات الموردين خلال ${payables.summary.dueSoonDays} أيام` },
        count: payables.summary.dueSoonCount, amount: payables.summary.dueSoonAmount,
        route: '/reports/supplier-aging',
        offenders: payables.rows.filter((r) => r.status === 'DUE_SOON').slice(0, 3).map((r) => ({ id: r.id, label: `${r.supplier.name} · ${r.dueDate}`, amount: r.remainingAmount, route: `/suppliers/${r.supplier.id}` })),
      });
    }
    push(alerts, {
      key: 'aging-service-jobs', severity: 'serious', label: { en: 'Aging service jobs', ar: 'طلبات صيانة متأخرة' },
      count: service.totals.aging, route: '/service?aging=true',
      offenders: service.agingJobs.slice(0, 3).map((job) => ({ id: job.id, label: `${job.jobNumber} · ${job.customerName}`, route: `/service/${job.id}` })),
    });

    const companyJobs = serviceJobs.filter((job) => job.status === ServiceJobStatus.SENT_TO_COMPANY && job.sentToCompanyDate && differenceInDays(prismaDateToBusinessDate(job.sentToCompanyDate), businessDate) > DASHBOARD_ALERT_THRESHOLDS.companyServiceJobDays);
    const readyJobs = serviceJobs.filter((job) => job.status === ServiceJobStatus.READY_FOR_PICKUP && differenceInDays(prismaDateToBusinessDate(job.serviceCreatedDate), businessDate) > DASHBOARD_ALERT_THRESHOLDS.readyForPickupDays);
    pushService(alerts, 'company-jobs', 'Jobs at company too long', 'طلبات لدى الشركة منذ مدة', companyJobs, '/service?status=SENT_TO_COMPANY');
    pushService(alerts, 'ready-not-collected', 'Ready but not collected', 'جاهزة ولم تُستلم', readyJobs, '/service?status=READY_FOR_PICKUP');

    const activeProducts = productRecords.products.filter((product) => product.isActive);
    pushProduct(alerts, 'products-missing-barcode', 'Products missing barcode', 'منتجات دون باركود', activeProducts.filter((p) => !p.barcode), '/products?barcode=missing');
    pushProduct(alerts, 'products-missing-pricing', 'Products missing pricing', 'منتجات دون تسعير', activeProducts.filter((p) => !p.useCustomPricing && !p.pricingPresetId), '/products?pricing=missing');
    pushProduct(alerts, 'products-missing-cost', 'Products missing cost price', 'منتجات دون سعر تكلفة', activeProducts.filter((p) => !p.costPrice), '/products?cost=missing');

    return { alerts: alerts.sort((a, b) => severityRank(b.severity) - severityRank(a.severity) || Number(b.amount ?? 0) - Number(a.amount ?? 0) || b.count - a.count), total: alerts.reduce((sum, alert) => sum + alert.count, 0) };
  }
}

function push(alerts: DashboardAlert[], alert: DashboardAlert): void {
  if (alert.count > 0) alerts.push(alert);
}

function pushService(alerts: DashboardAlert[], key: string, en: string, ar: string, jobs: Awaited<ReturnType<typeof ServiceAnalyticsRepository.load>>, route: string) {
  push(alerts, { key, severity: 'warning', label: { en, ar }, count: jobs.length, route, offenders: jobs.slice(0, 3).map((job) => ({ id: job.id, label: `${job.jobNumber} · ${job.customer.name}`, route: `/service/${job.id}` })) });
}

function pushProduct(alerts: DashboardAlert[], key: string, en: string, ar: string, products: Array<{ id: string; name: string; model: string }>, route: string) {
  push(alerts, { key, severity: 'warning', label: { en, ar }, count: products.length, route, offenders: products.slice(0, 3).map((product) => ({ id: product.id, label: `${product.name} · ${product.model}`, route: `/products/${product.id}` })) });
}

function severityRank(value: DashboardAlert['severity']): number {
  return value === 'critical' ? 3 : value === 'serious' ? 2 : 1;
}
