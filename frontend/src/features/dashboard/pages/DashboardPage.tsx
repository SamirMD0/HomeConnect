import { useEffect, useMemo, useState } from 'react';
import { Zap } from 'lucide-react';
import { useAuth } from '../../../hooks/useAuth';
import { dashboardLabels } from '../config/dashboard-labels';
import { QuickActions } from '../components/QuickActions';
import { DashboardFilterBar } from '../components/layout/DashboardFilterBar';
import { DashboardSection } from '../components/layout/DashboardSection';
import { TODAY_KPI_KEYS, TodayRail } from '../components/layout/TodayRail';
import { TodayBanner } from '../components/layout/TodayBanner';
import { DashboardAnchorNav, type DashboardAnchor } from '../components/layout/DashboardAnchorNav';
import { KpiStrip } from '../components/kpi/KpiStrip';
import { DashboardSectionBoundary } from '../components/layout/DashboardSectionBoundary';
import { SalesByDayChart } from '../components/charts/SalesByDayChart';
import { ActivityFeed } from '../components/sections/ActivityFeed';
import { AlertsCenter } from '../components/sections/AlertsCenter';
import { CustomerAnalytics } from '../components/sections/CustomerAnalytics';
import { ProductAnalytics } from '../components/sections/ProductAnalytics';
import { ServiceAnalytics } from '../components/sections/ServiceAnalytics';
import { SalesAnalytics } from '../components/sections/SalesAnalytics';
import { SectionState } from '../components/sections/SectionState';
import { SupplierAnalytics } from '../components/sections/SupplierAnalytics';
import { MonthEndSnapshot } from '../components/sections/MonthEndSnapshot';
import { BranchesOverview } from '../components/sections/BranchesOverview';
import { useShowBranchColumn } from '../../branches/scope/branch-ui';
import {
  useCustomerAnalytics,
  useDashboardActivity,
  useDashboardAlerts,
  useDashboardOverview,
  useMonthEnd,
  useProductAnalytics,
  useRefreshDashboard,
  useSalesAnalytics,
  useServiceAnalytics,
  useSupplierAnalytics,
} from '../hooks/useDashboard';
import type { DashboardQueryParams } from '../types';
import { InventoryDashboardCards } from '../../inventory/components/InventoryDashboardCards';

/**
 * IDs used both as `<section id>` anchors and as jump targets in the sticky
 * `DashboardAnchorNav`. Extracted so the two sides can't drift.
 */
const anchorIds = {
  branches: 'dashboard-branches',
  alerts: 'dashboard-alerts',
  inventory: 'dashboard-inventory',
  customers: 'dashboard-customers',
  suppliers: 'dashboard-suppliers',
  sales: 'dashboard-sales',
  service: 'dashboard-service',
  products: 'dashboard-products',
  monthEnd: 'dashboard-month-end',
  activity: 'dashboard-activity',
} as const;

const HIDE_NUMBERS_KEY = 'homeconnect.dashboard.hideNumbers';

export function DashboardPage() {
  // Hides money and counts behind a blur, e.g. when a customer is at the counter.
  // A per-device preference only; nothing is protected by it.
  const [numbersHidden, setNumbersHidden] = useState<boolean>(() => {
    try { return window.localStorage.getItem(HIDE_NUMBERS_KEY) === '1'; } catch { return false; }
  });
  useEffect(() => {
    try { window.localStorage.setItem(HIDE_NUMBERS_KEY, numbersHidden ? '1' : '0'); } catch { /* storage unavailable */ }
  }, [numbersHidden]);

  const { user } = useAuth();
  const showBranches = useShowBranchColumn();
  const [query, setQuery] = useState<DashboardQueryParams>({ range: 'month', includeArchived: false });
  const [selectedMonth, setSelectedMonth] = useState('');
  const effectiveQuery = useMemo(
    () =>
      query.range === 'custom' && (!query.from || !query.to)
        ? { ...query, range: 'month' as const, from: undefined, to: undefined }
        : query,
    [query]
  );
  const overview = useDashboardOverview(effectiveQuery);
  const customer = useCustomerAnalytics(effectiveQuery);
  const supplier = useSupplierAnalytics(effectiveQuery);
  const sales = useSalesAnalytics(effectiveQuery);
  const service = useServiceAnalytics(effectiveQuery);
  const product = useProductAnalytics(effectiveQuery);
  const alerts = useDashboardAlerts(effectiveQuery);
  const activity = useDashboardActivity();
  const businessDate = overview.data?.meta.businessDate ?? new Date().toISOString().slice(0, 10);
  const month = selectedMonth || businessDate.slice(0, 7);
  const monthEnd = useMonthEnd(month, user?.role === 'ADMIN');
  const refresh = useRefreshDashboard();
  const refreshing = [overview, customer, supplier, sales, service, product, alerts, activity, monthEnd].some(
    (result) => result.isFetching
  );

  const anchors: DashboardAnchor[] = useMemo(() => {
    const list: DashboardAnchor[] = [
      ...(showBranches ? [{ id: anchorIds.branches, label: 'Branches' }] : []),
      { id: anchorIds.alerts, label: 'Alerts' },
      { id: anchorIds.inventory, label: 'Inventory' },
      { id: anchorIds.customers, label: 'Customers' },
      { id: anchorIds.suppliers, label: 'Suppliers' },
      { id: anchorIds.sales, label: 'Sales' },
      { id: anchorIds.service, label: 'Service' },
      { id: anchorIds.products, label: 'Products' },
    ];
    if (user?.role === 'ADMIN') list.push({ id: anchorIds.monthEnd, label: 'Month-End' });
    list.push({ id: anchorIds.activity, label: 'Activity' });
    return list;
  }, [user?.role, showBranches]);

  return (
    <div className={`dashboard-shell${numbersHidden ? ' numbers-hidden' : ''}`}>
      <DashboardFilterBar
        query={query}
        onChange={setQuery}
        onRefresh={refresh}
        isRefreshing={refreshing}
        generatedAt={overview.data?.meta.generatedAt}
        numbersHidden={numbersHidden}
        onToggleNumbers={() => setNumbersHidden((value) => !value)}
      />

      <div className="grid gap-4 xl:grid-cols-[22rem_minmax(0,1fr)]">
        <TodayRail
          businessDate={businessDate}
          kpis={overview.data?.data.kpis}
          isLoading={overview.isLoading}
          alerts={alerts.data?.data}
          alertsAnchorId={anchorIds.alerts}
        />

        <div className="dashboard-panel min-w-0 divide-y divide-slate-200">
          <DashboardSectionBoundary>
            <KpiStrip
              kpis={overview.data?.data.kpis}
              exclude={TODAY_KPI_KEYS}
              isLoading={overview.isLoading}
              isError={overview.isError}
              onRetry={() => overview.refetch()}
            />
          </DashboardSectionBoundary>

          <div className="p-5 lg:p-8">
            <TodayBanner totals={sales.data?.data.totals} />
          </div>

          <div className="p-5 lg:p-8">
            <DashboardSectionBoundary>
              <SectionState
                isLoading={sales.isLoading}
                isError={sales.isError}
                onRetry={() => sales.refetch()}
                emptyText="No sales activity / لا توجد حركة مبيعات"
              >
                <SalesByDayChart data={sales.data?.data.salesByDay ?? []} />
              </SectionState>
            </DashboardSectionBoundary>
          </div>
        </div>
      </div>

      <DashboardAnchorNav anchors={anchors} />

      <div className="dashboard-chapters">
        <div>
          <DashboardSectionBoundary>
            <DashboardSection title={dashboardLabels.quickActions} icon={Zap}>
              <QuickActions />
            </DashboardSection>
          </DashboardSectionBoundary>
        </div>

        {showBranches && (
          <div id={anchorIds.branches} className="scroll-mt-28">
            <DashboardSectionBoundary>
              <BranchesOverview
                customer={customer.data?.data}
                supplier={supplier.data?.data}
                isLoading={customer.isLoading}
                isError={customer.isError}
                onRetry={() => { void customer.refetch(); void supplier.refetch(); }}
              />
            </DashboardSectionBoundary>
          </div>
        )}

        <div id={anchorIds.alerts} className="scroll-mt-28">
          <DashboardSectionBoundary>
            <AlertsCenter
              data={alerts.data?.data}
              isLoading={alerts.isLoading}
              isError={alerts.isError}
              onRetry={() => alerts.refetch()}
            />
          </DashboardSectionBoundary>
        </div>

        <div id={anchorIds.inventory} className="scroll-mt-28">
          <DashboardSectionBoundary>
            <InventoryDashboardCards />
          </DashboardSectionBoundary>
        </div>

        <div id={anchorIds.customers} className="scroll-mt-28">
          <DashboardSectionBoundary>
            <CustomerAnalytics
              data={customer.data?.data}
              isLoading={customer.isLoading}
              isError={customer.isError}
              onRetry={() => customer.refetch()}
            />
          </DashboardSectionBoundary>
        </div>

        <div id={anchorIds.suppliers} className="scroll-mt-28">
          <DashboardSectionBoundary>
            <SupplierAnalytics
              data={supplier.data?.data}
              isLoading={supplier.isLoading}
              isError={supplier.isError}
              onRetry={() => supplier.refetch()}
            />
          </DashboardSectionBoundary>
        </div>

        <div id={anchorIds.sales} className="scroll-mt-28">
          <DashboardSectionBoundary>
            <SalesAnalytics
              data={sales.data?.data}
              isLoading={sales.isLoading}
              isError={sales.isError}
              onRetry={() => sales.refetch()}
            />
          </DashboardSectionBoundary>
        </div>

        <div id={anchorIds.service} className="scroll-mt-28">
          <DashboardSectionBoundary>
            <ServiceAnalytics
              data={service.data?.data}
              isLoading={service.isLoading}
              isError={service.isError}
              onRetry={() => service.refetch()}
            />
          </DashboardSectionBoundary>
        </div>

        <div id={anchorIds.products} className="scroll-mt-28">
          <DashboardSectionBoundary>
            <ProductAnalytics
              data={product.data?.data}
              isLoading={product.isLoading}
              isError={product.isError}
              onRetry={() => product.refetch()}
            />
          </DashboardSectionBoundary>
        </div>

        {user?.role === 'ADMIN' && (
          <div id={anchorIds.monthEnd} className="scroll-mt-28">
            <DashboardSectionBoundary>
              <MonthEndSnapshot
                month={month}
                onMonthChange={setSelectedMonth}
                data={monthEnd.data?.data}
                isLoading={monthEnd.isLoading}
                isError={monthEnd.isError}
                onRetry={() => monthEnd.refetch()}
              />
            </DashboardSectionBoundary>
          </div>
        )}

        <div id={anchorIds.activity} className="scroll-mt-28">
          <DashboardSectionBoundary>
            <ActivityFeed
              data={activity.data?.data}
              isLoading={activity.isLoading}
              isError={activity.isError}
              onRetry={() => activity.refetch()}
              businessDate={businessDate}
            />
          </DashboardSectionBoundary>
        </div>
      </div>
    </div>
  );
}
