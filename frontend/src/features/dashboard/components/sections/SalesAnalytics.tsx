import { ShoppingCart } from 'lucide-react';
import { formatMoney } from '../../../customer-financial/utils/financial-format';
import { dashboardLabels } from '../../config/dashboard-labels';
import type { SalesAnalyticsData } from '../../types';
import { DeliveryPipelineChart } from '../charts/DeliveryPipelineChart';
import { SalesByDayChart } from '../charts/SalesByDayChart';
import { SalesFulfillmentStatusDonut } from '../charts/SalesFulfillmentStatusDonut';
import { SalesPaymentStatusDonut } from '../charts/SalesPaymentStatusDonut';
import { TopProductsSoldChart } from '../charts/TopProductsSoldChart';
import { DashboardSection } from '../layout/DashboardSection';
import { SectionState } from './SectionState';

export function SalesAnalytics({ data, isLoading, isError, onRetry }: { data?: SalesAnalyticsData; isLoading: boolean; isError: boolean; onRetry: () => void }) {
  return <DashboardSection title={dashboardLabels.salesAnalytics} icon={ShoppingCart}><SectionState isLoading={isLoading} isError={isError} onRetry={onRetry} emptyText="No sales activity / لا توجد حركة مبيعات"><div className="mb-3 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6"><Metric label="Sales today / مبيعات اليوم" value={formatMoney(data?.totals.salesToday ?? '0.00')} /><Metric label="Orders today / طلبات اليوم" value={String(data?.totals.ordersToday ?? 0)} /><Metric label="Pending delivery / بانتظار التوصيل" value={String(data?.totals.pendingDelivery ?? 0)} /><Metric label="Unpaid / غير مدفوعة" value={String(data?.totals.unpaidOrders ?? 0)} /><Metric label="Partial / جزئية" value={String(data?.totals.partialPayments ?? 0)} /><Metric label="Installments / تقسيط" value={String(data?.totals.installmentOrders ?? 0)} /></div><div className="grid grid-cols-1 gap-3 xl:grid-cols-2"><SalesByDayChart data={data?.salesByDay ?? []} /><SalesPaymentStatusDonut data={data?.paymentStatusDistribution ?? []} /><SalesFulfillmentStatusDonut data={data?.fulfillmentStatusDistribution ?? []} /><DeliveryPipelineChart data={data?.deliveryPipeline ?? []} /><TopProductsSoldChart data={data?.topProducts ?? []} /></div></SectionState></DashboardSection>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="border-l-2 border-blue-500 pl-3"><span className="text-xs text-slate-500">{label}</span><strong className="mt-1 block text-lg text-slate-900">{value}</strong></div>;
}
