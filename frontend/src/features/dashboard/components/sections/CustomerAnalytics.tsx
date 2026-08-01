import { Users } from 'lucide-react';
import { dashboardLabels } from '../../config/dashboard-labels';
import type { CustomerAnalyticsData } from '../../types';
import { CollectionsVsDebtChart } from '../charts/CollectionsVsDebtChart';
import { DebtAgeDistributionChart } from '../charts/DebtAgeDistributionChart';
import { MonthlyComparisonChart } from '../charts/MonthlyComparisonChart';
import { TopDebtorsChart } from '../charts/TopDebtorsChart';
import { DashboardSection } from '../layout/DashboardSection';
import { SectionState } from './SectionState';

export function CustomerAnalytics({ data, isLoading, isError, onRetry }: { data?: CustomerAnalyticsData; isLoading: boolean; isError: boolean; onRetry: () => void }) {
  return <DashboardSection title={dashboardLabels.customerAnalytics} icon={Users}><SectionState isLoading={isLoading} isError={isError} isEmpty={Boolean(data && data.trend.length === 0)} onRetry={onRetry} emptyText="No customer financial activity in this range / لا توجد حركة مالية للزبائن"><div className="grid grid-cols-1 gap-3 xl:grid-cols-2"><CollectionsVsDebtChart data={data?.trend ?? []} /><MonthlyComparisonChart data={data?.monthlyComparison ?? []} /><DebtAgeDistributionChart data={data?.ageDistribution ?? []} />{data?.topDebtors ? <TopDebtorsChart data={data.topDebtors} /> : <div className="dashboard-state"><p>Top debtor details are available to administrators / تفاصيل أكبر المدينين متاحة للمسؤولين</p></div>}</div></SectionState></DashboardSection>;
}

