import { useMemo, useState } from 'react';
import { Gauge, Zap } from 'lucide-react';
import { useAuth } from '../../../hooks/useAuth';
import { dashboardLabels } from '../config/dashboard-labels';
import { QuickActions } from '../components/QuickActions';
import { DashboardFilterBar } from '../components/layout/DashboardFilterBar';
import { BilingualLabel } from '../components/layout/BilingualLabel';
import { DashboardSection } from '../components/layout/DashboardSection';
import { KpiStrip } from '../components/kpi/KpiStrip';
import { DashboardSectionBoundary } from '../components/layout/DashboardSectionBoundary';
import { ActivityFeed } from '../components/sections/ActivityFeed';
import { AlertsCenter } from '../components/sections/AlertsCenter';
import { CustomerAnalytics } from '../components/sections/CustomerAnalytics';
import { ProductAnalytics } from '../components/sections/ProductAnalytics';
import { ServiceAnalytics } from '../components/sections/ServiceAnalytics';
import { SalesAnalytics } from '../components/sections/SalesAnalytics';
import { SupplierAnalytics } from '../components/sections/SupplierAnalytics';
import { MonthEndSnapshot } from '../components/sections/MonthEndSnapshot';
import { ErpModuleMap } from '../components/sections/ErpModuleMap';
import {
  useCustomerAnalytics, useDashboardActivity, useDashboardAlerts, useDashboardOverview,
  useMonthEnd, useProductAnalytics, useRefreshDashboard, useSalesAnalytics, useServiceAnalytics, useSupplierAnalytics,
} from '../hooks/useDashboard';
import type { DashboardQueryParams } from '../types';
import { InventoryDashboardCards } from '../../inventory/components/InventoryDashboardCards';

export function DashboardPage() {
  const { user } = useAuth();
  const [query, setQuery] = useState<DashboardQueryParams>({ range: 'month', includeArchived: false });
  const [selectedMonth, setSelectedMonth] = useState('');
  const effectiveQuery = useMemo(() => query.range === 'custom' && (!query.from || !query.to) ? { ...query, range: 'month' as const, from: undefined, to: undefined } : query, [query]);
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
  const refreshing = [overview, customer, supplier, sales, service, product, alerts, activity, monthEnd].some((result) => result.isFetching);

  return <div className="dashboard-shell">
    <header className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><div className="flex items-center gap-2"><Gauge className="h-6 w-6 text-emerald-600" /><h1 className="text-2xl font-bold text-slate-950"><BilingualLabel label={dashboardLabels.pageTitle} compact /></h1></div><p className="mt-1 text-sm text-slate-500"><BilingualLabel label={dashboardLabels.pageSubtitle} compact /></p></div></header>
    <DashboardFilterBar query={query} onChange={setQuery} onRefresh={refresh} isRefreshing={refreshing} generatedAt={overview.data?.meta.generatedAt} />
    <DashboardSectionBoundary><KpiStrip kpis={overview.data?.data.kpis} isLoading={overview.isLoading} isError={overview.isError} onRetry={() => overview.refetch()} /></DashboardSectionBoundary>
    <DashboardSectionBoundary><DashboardSection title={dashboardLabels.quickActions} icon={Zap}><QuickActions /></DashboardSection></DashboardSectionBoundary>
    <DashboardSectionBoundary><AlertsCenter data={alerts.data?.data} isLoading={alerts.isLoading} isError={alerts.isError} onRetry={() => alerts.refetch()} /></DashboardSectionBoundary>
    <DashboardSectionBoundary><InventoryDashboardCards /></DashboardSectionBoundary>
    <DashboardSectionBoundary><CustomerAnalytics data={customer.data?.data} isLoading={customer.isLoading} isError={customer.isError} onRetry={() => customer.refetch()} /></DashboardSectionBoundary>
    <DashboardSectionBoundary><SupplierAnalytics data={supplier.data?.data} isLoading={supplier.isLoading} isError={supplier.isError} onRetry={() => supplier.refetch()} /></DashboardSectionBoundary>
    <DashboardSectionBoundary><SalesAnalytics data={sales.data?.data} isLoading={sales.isLoading} isError={sales.isError} onRetry={() => sales.refetch()} /></DashboardSectionBoundary>
    <DashboardSectionBoundary><ServiceAnalytics data={service.data?.data} isLoading={service.isLoading} isError={service.isError} onRetry={() => service.refetch()} /></DashboardSectionBoundary>
    <DashboardSectionBoundary><ProductAnalytics data={product.data?.data} isLoading={product.isLoading} isError={product.isError} onRetry={() => product.refetch()} /></DashboardSectionBoundary>
    {user?.role === 'ADMIN' && <DashboardSectionBoundary><MonthEndSnapshot month={month} onMonthChange={setSelectedMonth} data={monthEnd.data?.data} isLoading={monthEnd.isLoading} isError={monthEnd.isError} onRetry={() => monthEnd.refetch()} /></DashboardSectionBoundary>}
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-[7fr_5fr]"><DashboardSectionBoundary><ActivityFeed data={activity.data?.data} isLoading={activity.isLoading} isError={activity.isError} onRetry={() => activity.refetch()} businessDate={businessDate} /></DashboardSectionBoundary><DashboardSectionBoundary><ErpModuleMap counts={overview.data?.data.moduleCounts} /></DashboardSectionBoundary></div>
  </div>;
}
