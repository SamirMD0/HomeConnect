import { type BranchScope } from '../branches/branch-scope';
import { withBranchBreakdown } from '../branches/branch-breakdown';
import { todayInBusinessTimezone } from '../financial';
import { DashboardActivityService } from './activity/dashboard-activity.service';
import { DashboardAlertsService } from './alerts/dashboard-alerts.service';
import { DASHBOARD_CACHE_TTL_MS } from './dashboard.config';
import type { DashboardQueryInput } from './dashboard.validator';
import { CustomerAnalyticsService } from './customer/customer-analytics.service';
import { MonthEndService } from './month-end/month-end.service';
import { DashboardOverviewService } from './overview/dashboard-overview.service';
import { ProductAnalyticsService } from './product/product-analytics.service';
import { dashboardCache, dashboardCacheKey } from './shared/dashboard-cache';
import { createDashboardMeta, resolveDashboardRange } from './shared/dashboard-range';
import { ServiceAnalyticsService } from './service/service-analytics.service';
import { SupplierAnalyticsService } from './supplier/supplier-analytics.service';
import { SalesAnalyticsService } from './sales/sales-analytics.service';

export interface DashboardRequestOptions {
  role: string;
  bypassCache?: boolean;
}

export class DashboardAnalyticsService {
  static overview(query: DashboardQueryInput, options: DashboardRequestOptions, scope: BranchScope) {
    return this.ranged('overview', DASHBOARD_CACHE_TTL_MS.overview, query, options, (range, businessDate, scope) =>
      DashboardOverviewService.get(range, { includeArchived: query.includeArchived, businessDate }, scope), scope
    );
  }

  static customerFinancial(query: DashboardQueryInput, options: DashboardRequestOptions, scope: BranchScope) {
    return this.ranged('customer-financial', DASHBOARD_CACHE_TTL_MS.customerFinancial, query, options, (range, businessDate, scope) =>
      CustomerAnalyticsService.get(range, { includeArchived: query.includeArchived, includeAdminData: options.role === 'ADMIN', businessDate }, scope), scope
    );
  }

  static supplierFinancial(query: DashboardQueryInput, options: DashboardRequestOptions, scope: BranchScope) {
    return this.ranged('supplier-financial', DASHBOARD_CACHE_TTL_MS.supplierFinancial, query, options, (range, businessDate, scope) =>
      SupplierAnalyticsService.get(range, query.includeArchived, businessDate, scope), scope
    );
  }

  static serviceSummary(query: DashboardQueryInput, options: DashboardRequestOptions, scope: BranchScope) {
    return this.ranged('service-summary', DASHBOARD_CACHE_TTL_MS.serviceSummary, query, options, (range, businessDate, scope) =>
      ServiceAnalyticsService.get(range, businessDate, scope), scope
    );
  }

  static productSummary(query: DashboardQueryInput, options: DashboardRequestOptions, scope: BranchScope) {
    return this.ranged('product-summary', DASHBOARD_CACHE_TTL_MS.productSummary, query, options, () => ProductAnalyticsService.get(), scope);
  }

  static salesSummary(query: DashboardQueryInput, options: DashboardRequestOptions, scope: BranchScope) {
    return this.ranged('sales-summary', DASHBOARD_CACHE_TTL_MS.salesSummary, query, options, (range, businessDate, scope) =>
      SalesAnalyticsService.get(range, businessDate, scope), scope
    );
  }

  static alerts(query: DashboardQueryInput, options: DashboardRequestOptions, scope: BranchScope) {
    return this.ranged('alerts', DASHBOARD_CACHE_TTL_MS.alerts, query, options, (range, businessDate, scope) =>
      DashboardAlertsService.get(range, { includeArchived: query.includeArchived, includeAdminData: options.role === 'ADMIN', businessDate }, scope), scope
    );
  }

  static activity(limit: number, options: DashboardRequestOptions, scope: BranchScope) {
    const businessDate = todayInBusinessTimezone();
    const range = resolveDashboardRange({ range: 'month' }, businessDate);
    const key = `activity:${limit}:${options.role}:${[...scope.branchIds].sort().join(',')}`;
    return dashboardCache.getOrCreate(key, DASHBOARD_CACHE_TTL_MS.activity, async () => ({
      meta: createDashboardMeta(range, businessDate),
      data: await DashboardActivityService.get(limit, options.role, scope),
    }), options.bypassCache);
  }

  static monthEnd(month: string, options: DashboardRequestOptions, scope: BranchScope) {
    const businessDate = todayInBusinessTimezone();
    const range = resolveDashboardRange({ range: 'month' }, businessDate);
    const isCurrentMonth = month === businessDate.slice(0, 7);
    const ttl = isCurrentMonth ? DASHBOARD_CACHE_TTL_MS.currentMonthEnd : DASHBOARD_CACHE_TTL_MS.closedMonthEnd;
    return dashboardCache.getOrCreate(`month-end:${month}:${options.role}:${[...scope.branchIds].sort().join(',')}`, ttl, async () => ({
      meta: createDashboardMeta(range, businessDate),
      data: await withBranchBreakdown(scope, scoped => MonthEndService.get(month, scoped)),
    }), options.bypassCache);
  }

  private static ranged<T>(
    endpoint: string,
    ttl: number,
    query: DashboardQueryInput,
    options: DashboardRequestOptions,
    load: (range: ReturnType<typeof resolveDashboardRange>, businessDate: string, scope: BranchScope) => Promise<T>, scope: BranchScope
  ) {
    const businessDate = todayInBusinessTimezone();
    const range = resolveDashboardRange(query, businessDate);
    const key = `${dashboardCacheKey(endpoint, range, query.includeArchived, options.role + ':' + [...scope.branchIds].sort().join(','))}`;
    return dashboardCache.getOrCreate(key, ttl, async () => ({
      meta: createDashboardMeta(range, businessDate),
      data: endpoint === 'product-summary' ? { ...await load(range, businessDate, scope), inventoryScope: 'all-branches' as const } : await withBranchBreakdown(scope, scoped => load(range, businessDate, scoped) as Promise<T & object>),
    }), options.bypassCache);
  }
}
