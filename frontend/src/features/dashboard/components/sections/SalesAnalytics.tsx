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
import { InlineMetric } from '../layout/InlineMetric';
import { SectionState } from './SectionState';

export function SalesAnalytics({ data, isLoading, isError, onRetry }: { data?: SalesAnalyticsData; isLoading: boolean; isError: boolean; onRetry: () => void }) {
  return (
    <DashboardSection title={dashboardLabels.salesAnalytics} icon={ShoppingCart}>
      <SectionState isLoading={isLoading} isError={isError} onRetry={onRetry} emptyText="No sales activity / لا توجد حركة مبيعات">
        <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
          <InlineMetric tone="brand" label="Sales today / مبيعات اليوم" value={formatMoney(data?.totals.salesToday ?? '0.00')} />
          <InlineMetric tone="brand" label="Orders today / طلبات اليوم" value={String(data?.totals.ordersToday ?? 0)} />
          <InlineMetric tone="info" label="Pending delivery / بانتظار التوصيل" value={String(data?.totals.pendingDelivery ?? 0)} />
          <InlineMetric tone="warning" label="Unpaid / غير مدفوعة" value={String(data?.totals.unpaidOrders ?? 0)} />
          <InlineMetric tone="warning" label="Partial / جزئية" value={String(data?.totals.partialPayments ?? 0)} />
          <InlineMetric tone="neutral" label="Installments / تقسيط" value={String(data?.totals.installmentOrders ?? 0)} />
        </div>
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          <SalesByDayChart data={data?.salesByDay ?? []} />
          <SalesPaymentStatusDonut data={data?.paymentStatusDistribution ?? []} />
          <SalesFulfillmentStatusDonut data={data?.fulfillmentStatusDistribution ?? []} />
          <DeliveryPipelineChart data={data?.deliveryPipeline ?? []} />
          <TopProductsSoldChart data={data?.topProducts ?? []} />
        </div>
      </SectionState>
    </DashboardSection>
  );
}
