import {
  Banknote,
  Boxes,
  CircleDollarSign,
  Download,
  PackageSearch,
  ReceiptText,
  ShoppingCart,
  Truck,
  UserPlus,
  Users,
} from 'lucide-react';
import { useState } from 'react';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';
import { DebtAgeDistributionChart } from '../../dashboard/components/charts/DebtAgeDistributionChart';
import { CollectionsVsDebtChart } from '../../dashboard/components/charts/CollectionsVsDebtChart';
import { SalesByDayChart } from '../../dashboard/components/charts/SalesByDayChart';
import { SalesPaymentStatusDonut } from '../../dashboard/components/charts/SalesPaymentStatusDonut';
import { TopDebtorsChart } from '../../dashboard/components/charts/TopDebtorsChart';
import { TopProductsSoldChart } from '../../dashboard/components/charts/TopProductsSoldChart';
import { StatCard } from '../../dashboard/components/StatCard';
import { AlertsCenter } from '../../dashboard/components/sections/AlertsCenter';
import { formatMoney } from '../../customer-financial/utils/financial-format';
import { useMonthlyReview } from '../hooks/useMonthlyReview';
import { monthlyReviewApi } from '../api/monthly-review.api';
import type {
  MonthlyReviewData,
  MonthlyReviewMovement,
  MonthlyReviewQuery,
  MonthlyReviewResponse,
} from '../types/monthly-review.types';
import { ReportEmptyState, ReportErrorState, ReportLoadingState } from './ReportStates';
import { ReportPeriodSelector } from './ReportPeriodSelector';
import { TopSupplierBalancesChart } from './ReportCharts';

type ReviewEnvelope = Omit<MonthlyReviewResponse, 'success'>;

export function MonthlyReview() {
  const [period, setPeriod] = useState<MonthlyReviewQuery>({ period: 'thisMonth' });
  const review = useMonthlyReview(period);
  const previousPeriod: MonthlyReviewQuery = {
    period: 'custom',
    from: review.data?.meta.previousFrom,
    to: review.data?.meta.previousTo,
  };
  const comparison = useMonthlyReview(previousPeriod, Boolean(review.data));
  const incompleteCustom = period.period === 'custom' && (!period.from || !period.to);

  const exportCsv = async () => {
    try {
      const blob = await monthlyReviewApi.exportCsv(period);
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `monthly-review-${review.data?.meta.from ?? 'report'}-to-${review.data?.meta.to ?? 'report'}.csv`;
      anchor.click();
      window.URL.revokeObjectURL(url);
    } catch { toast.error('CSV export failed / تعذر تصدير CSV'); }
  };

  return (
    <div className="space-y-5">
      <div className="flex justify-end print:hidden"><button type="button" onClick={() => void exportCsv()} disabled={incompleteCustom || !review.data} className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 px-3 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"><Download className="h-4 w-4" />CSV</button></div>
      <ReportPeriodSelector
        value={period}
        onChange={setPeriod}
        onRefresh={() => {
          void review.refetch();
          if (comparison.data) void comparison.refetch();
        }}
        isRefreshing={review.isFetching || comparison.isFetching}
        generatedAt={review.data?.meta.generatedAt}
      />

      {incompleteCustom ? (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-5 text-sm text-blue-900">
          Select both dates to load the custom review / اختر التاريخين لتحميل المراجعة المخصصة
        </div>
      ) : review.isLoading && !review.data ? (
        <ReportLoadingState />
      ) : review.isError || !review.data ? (
        <ReportErrorState onRetry={() => void review.refetch()} />
      ) : isMonthlyReviewEmpty(review.data.data) ? (
        <>
          <ReviewPeriodHeader review={review.data} />
          <ReportEmptyState />
        </>
      ) : (
        <MonthlyReviewContent
          review={review.data}
          comparison={comparison.data}
          comparisonUnavailable={comparison.isError}
        />
      )}
    </div>
  );
}

export function MonthlyReviewContent({
  review,
  comparison,
  comparisonUnavailable = false,
}: {
  review: ReviewEnvelope;
  comparison?: ReviewEnvelope;
  comparisonUnavailable?: boolean;
}) {
  const { data } = review;
  return (
    <div className="space-y-6">
      <ReviewPeriodHeader review={review} />

      <section aria-labelledby="monthly-review-headline">
        <h2 id="monthly-review-headline" className="sr-only">Monthly review headline</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <StatCard title="Sales / المبيعات" value={formatMoney(data.sales.totalAmount)} icon={<ShoppingCart className="h-5 w-5" />} color="info" />
          <StatCard title="Paid / المدفوع" value={formatMoney(data.sales.paidAmount)} icon={<Banknote className="h-5 w-5" />} color="success" />
          <StatCard title="Unpaid / غير المدفوع" value={formatMoney(data.sales.unpaidAmount)} icon={<CircleDollarSign className="h-5 w-5" />} color="danger" />
          <StatCard title="Orders / الطلبات" value={data.sales.orderCount} icon={<ReceiptText className="h-5 w-5" />} color="primary" />
          <StatCard title="New customers / زبائن جدد" value={data.customers.newCustomers} icon={<UserPlus className="h-5 w-5" />} color="warning" />
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4" aria-labelledby="monthly-review-comparison">
        <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 id="monthly-review-comparison" className="text-lg font-semibold text-slate-900">Period comparison / مقارنة الفترات</h2>
            <p className="text-xs text-slate-500">Backend-calculated values for the selected and immediately preceding periods.</p>
          </div>
          {comparison ? <span className="text-xs text-slate-500">Previous: {comparison.meta.from} → {comparison.meta.to}</span> : comparisonUnavailable ? <span className="text-xs text-amber-700">Previous period unavailable / الفترة السابقة غير متاحة</span> : <span className="text-xs text-slate-400">Loading previous period…</span>}
        </div>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <MetricComparisonTable title="Sales / المبيعات" rows={[
            ['Total sales', data.sales.totalAmount, comparison?.data.sales.totalAmount, true],
            ['Paid', data.sales.paidAmount, comparison?.data.sales.paidAmount, true],
            ['Unpaid', data.sales.unpaidAmount, comparison?.data.sales.unpaidAmount, true],
            ['Average order', data.sales.averageOrderValue, comparison?.data.sales.averageOrderValue, true],
            ['Orders', String(data.sales.orderCount), comparison ? String(comparison.data.sales.orderCount) : undefined, false],
          ]} />
          <MovementComparison title="Customers / الزبائن" current={data.customers.movement} previous={comparison?.data.customers.movement} />
          <MovementComparison title="Suppliers / الموردون" current={data.suppliers.movement} previous={comparison?.data.suppliers.movement} />
        </div>
      </section>

      {(data.sales.salesByDay.length > 0
        || data.sales.topProducts.length > 0
        || data.sales.paymentStatusDistribution.length > 0
        || data.customers.operationalSnapshot.ageDistribution.length > 0
        || data.customers.operationalSnapshot.topDebtors.length > 0
        || data.suppliers.operationalSnapshot.topBalances.length > 0
        || Boolean(comparison)) && (
        <section className="grid grid-cols-1 gap-4 xl:grid-cols-2" aria-label="Monthly review charts">
          {comparison && <CollectionsVsDebtChart data={[
            { bucket: `${comparison.meta.from} – ${comparison.meta.to}`, collected: comparison.data.customers.movement.collected, newDebt: comparison.data.customers.movement.newAmount },
            { bucket: `${review.meta.from} – ${review.meta.to}`, collected: data.customers.movement.collected, newDebt: data.customers.movement.newAmount },
          ]} />}
          {data.sales.salesByDay.length > 0 && <SalesByDayChart data={data.sales.salesByDay} />}
          {data.sales.topProducts.length > 0 && <TopProductsSoldChart data={data.sales.topProducts} />}
          {data.sales.paymentStatusDistribution.length > 0 && <SalesPaymentStatusDonut data={data.sales.paymentStatusDistribution} />}
          {data.customers.operationalSnapshot.ageDistribution.length > 0 && <DebtAgeDistributionChart data={data.customers.operationalSnapshot.ageDistribution} />}
          {data.customers.operationalSnapshot.topDebtors.length > 0 && <TopDebtorsChart data={data.customers.operationalSnapshot.topDebtors} />}
          {data.suppliers.operationalSnapshot.topBalances.length > 0 && <TopSupplierBalancesChart data={data.suppliers.operationalSnapshot.topBalances} />}
        </section>
      )}

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-3" aria-label="Operational snapshots">
        <SnapshotCard title="Customers requiring attention / زبائن يحتاجون متابعة" icon={<Users className="h-5 w-5" />}>
          <SnapshotRow label="Active customers" value={String(data.customers.activeCustomers)} />
          <SnapshotRow label="Paid in period" value={String(data.customers.paidCount)} />
          <SnapshotRow label="Did not pay" value={String(data.customers.didNotPayCount)} />
          {data.customers.didNotPay.slice(0, 5).map((customer) => (
            <Link key={customer.id} to={`/customers/${customer.id}`} className="user-text flex justify-between gap-2 border-t border-slate-100 py-2 text-xs hover:text-emerald-700" dir="auto">
              <span>{customer.name}</span><span>{customer.phone}</span>
            </Link>
          ))}
        </SnapshotCard>
        <SnapshotCard title="Supplier position / وضع الموردين" icon={<Truck className="h-5 w-5" />}>
          <SnapshotRow label="Current amount owed" value={formatMoney(data.suppliers.operationalSnapshot.owed)} />
          <SnapshotRow label="Suppliers with balance" value={String(data.suppliers.operationalSnapshot.suppliersWithBalance)} />
          {data.suppliers.operationalSnapshot.topBalances.slice(0, 5).map((supplier) => (
            <Link key={supplier.supplierId} to={`/suppliers/${supplier.supplierId}`} className="user-text flex justify-between gap-2 border-t border-slate-100 py-2 text-xs hover:text-emerald-700" dir="auto">
              <span>{supplier.supplierName}</span><strong>{formatMoney(supplier.balance)}</strong>
            </Link>
          ))}
        </SnapshotCard>
        <InventorySnapshot summary={data.inventory.operationalSnapshot.summary} />
      </section>

      <AlertsCenter data={data.risk} isLoading={false} isError={false} onRetry={() => undefined} />

      <section className="rounded-xl border border-slate-200 bg-white p-4 print:hidden" aria-labelledby="monthly-review-actions">
        <h2 id="monthly-review-actions" className="text-lg font-semibold text-slate-900">Actions / الإجراءات</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <ActionLink to="/sales-orders" icon={<ShoppingCart className="h-4 w-4" />} label="Review sales / مراجعة المبيعات" />
          <ActionLink to="/customers" icon={<Users className="h-4 w-4" />} label="Follow up customers / متابعة الزبائن" />
          <ActionLink to="/suppliers" icon={<Truck className="h-4 w-4" />} label="Review suppliers / مراجعة الموردين" />
          <ActionLink to="/inventory" icon={<PackageSearch className="h-4 w-4" />} label="Check inventory / فحص المخزون" />
        </div>
      </section>
    </div>
  );
}

function ReviewPeriodHeader({ review }: { review: ReviewEnvelope }) {
  return <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700"><strong>Reporting period / فترة التقرير:</strong> {review.meta.from} → {review.meta.to}<span className="ml-3 text-xs text-slate-500">Currency: {review.meta.currency}</span></div>;
}

type ComparisonRow = [label: string, current: string, previous: string | undefined, money: boolean];

function MetricComparisonTable({ title, rows }: { title: string; rows: ComparisonRow[] }) {
  return <div className="overflow-hidden rounded-lg border border-slate-200"><h3 className="bg-slate-50 px-3 py-2 text-sm font-semibold">{title}</h3><table className="w-full text-xs"><thead><tr className="border-t border-slate-200 text-slate-500"><th className="px-3 py-2 text-left">Metric</th><th className="px-3 py-2 text-right">Selected</th><th className="px-3 py-2 text-right">Previous</th></tr></thead><tbody>{rows.map(([label, current, previous, money]) => <tr key={label} className="border-t border-slate-100"><td className="px-3 py-2">{label}</td><td className="px-3 py-2 text-right font-semibold">{money ? formatMoney(current) : current}</td><td className="px-3 py-2 text-right text-slate-600">{previous === undefined ? '—' : money ? formatMoney(previous) : previous}</td></tr>)}</tbody></table></div>;
}

function MovementComparison({ title, current, previous }: { title: string; current: MonthlyReviewMovement; previous?: MonthlyReviewMovement }) {
  return <MetricComparisonTable title={title} rows={[
    ['Opening', current.opening, previous?.opening, true],
    ['New amount', current.newAmount, previous?.newAmount, true],
    ['Collected', current.collected, previous?.collected, true],
    ['Adjustments', current.adjustments, previous?.adjustments, true],
    ['Closing', current.closing, previous?.closing, true],
  ]} />;
}

function SnapshotCard({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return <article className="rounded-xl border border-slate-200 bg-white p-4"><div className="mb-3 flex items-center gap-2 text-slate-900"><span className="text-emerald-600">{icon}</span><h2 className="text-sm font-semibold">{title}</h2></div>{children}</article>;
}

function SnapshotRow({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between gap-3 border-t border-slate-100 py-2 text-xs first:border-0"><span className="text-slate-600">{label}</span><strong>{value}</strong></div>;
}

function InventorySnapshot({ summary }: { summary: MonthlyReviewData['inventory']['operationalSnapshot']['summary'] }) {
  return <SnapshotCard title="Inventory now / المخزون الآن" icon={<Boxes className="h-5 w-5" />}><SnapshotRow label="Tracked products" value={String(summary.trackedProducts)} /><SnapshotRow label="Low stock" value={String(summary.lowStockProducts)} /><SnapshotRow label="Out of stock" value={String(summary.outOfStockProducts)} /><SnapshotRow label="Total units" value={String(summary.totalUnits)} /><SnapshotRow label="Movements today" value={String(summary.movementsToday)} /><SnapshotRow label="Awaiting stock deduction" value={String(summary.ordersAwaitingStockDeduction)} /></SnapshotCard>;
}

function ActionLink({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return <Link to={to} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:border-emerald-300 hover:bg-emerald-50">{icon}{label}</Link>;
}

function isMonthlyReviewEmpty(data: MonthlyReviewData) {
  return data.sales.orderCount === 0
    && data.customers.newCustomers === 0
    && data.customers.movement.newAmount === '0.00'
    && data.customers.movement.collected === '0.00'
    && data.customers.movement.closing === '0.00'
    && data.suppliers.movement.newAmount === '0.00'
    && data.suppliers.movement.collected === '0.00'
    && data.suppliers.movement.closing === '0.00'
    && data.sales.salesByDay.length === 0
    && data.customers.operationalSnapshot.topDebtors.length === 0
    && data.suppliers.operationalSnapshot.topBalances.length === 0
    && data.inventory.operationalSnapshot.summary.trackedProducts === 0
    && data.risk.alerts.length === 0;
}
