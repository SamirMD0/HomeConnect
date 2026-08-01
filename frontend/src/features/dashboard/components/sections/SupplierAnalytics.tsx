import { Truck } from 'lucide-react';
import { formatMoney } from '../../../customer-financial/utils/financial-format';
import { dashboardLabels } from '../../config/dashboard-labels';
import type { SupplierAnalyticsData } from '../../types';
import { SupplierPaymentTrendChart } from '../charts/SupplierPaymentTrendChart';
import { DashboardSection } from '../layout/DashboardSection';
import { SectionState } from './SectionState';
export function SupplierAnalytics({ data, isLoading, isError, onRetry }: { data?: SupplierAnalyticsData; isLoading: boolean; isError: boolean; onRetry: () => void }) {
  return <DashboardSection title={dashboardLabels.supplierAnalytics} icon={Truck}><SectionState isLoading={isLoading} isError={isError} onRetry={onRetry} emptyText="No supplier activity / لا توجد حركة للمورّدين"><div className="mb-3 grid grid-cols-2 gap-3 md:grid-cols-4"><Metric label="Net owed" value={formatMoney(data?.totals.owed ?? '0.00')} /><Metric label="Paid in range" value={formatMoney(data?.totals.paid ?? '0.00')} /><Metric label="Paid today" value={formatMoney(data?.totals.paidToday ?? '0.00')} /><Metric label="With balance" value={String(data?.totals.suppliersWithBalance ?? 0)} /></div><div className="grid grid-cols-1 gap-3 xl:grid-cols-[2fr_1fr]"><SupplierPaymentTrendChart data={data?.trend ?? []} /><div className="rounded-lg border border-slate-200 p-3"><h3 className="mb-2 text-sm font-semibold text-slate-800">Largest supplier balances / أكبر أرصدة المورّدين</h3><div className="space-y-1.5">{data?.topBalances.length ? data.topBalances.map((row) => <div key={row.supplierId} className="flex items-center justify-between gap-3 border-b border-slate-100 py-2 text-xs last:border-0"><span className="user-text min-w-0 truncate" dir="auto">{row.supplierName}</span><strong>{formatMoney(row.balance)}</strong></div>) : <p className="py-8 text-center text-xs text-slate-400">No supplier balances / لا أرصدة</p>}</div></div></div></SectionState></DashboardSection>;
}
function Metric({ label, value }: { label: string; value: string }) { return <div className="border-l-2 border-emerald-500 pl-3"><span className="text-xs text-slate-500">{label}</span><strong className="mt-1 block text-lg text-slate-900">{value}</strong></div>; }

