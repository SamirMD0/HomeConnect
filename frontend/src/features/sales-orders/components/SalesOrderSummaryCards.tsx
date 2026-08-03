import { CalendarDays, CircleDollarSign, Clock3, Package, WalletCards } from 'lucide-react';
import { Card, Skeleton } from '../../../components/ui';
import { formatMoney, MISSING_MONEY } from '../../customer-financial/utils/financial-format';
import type { SalesOrderSummary } from '../types/sales-orders.types';
import type { PeriodCardLabels } from '../utils/sales-order-dates';

export function SalesOrderSummaryCards({ data, loading, period }: { data?: SalesOrderSummary; loading: boolean; period: PeriodCardLabels }) {
  const cards = [
    // formatMoney renders MISSING_MONEY when the server did not send the field,
    // so a value the API owes us reads as "—" rather than as an empty card.
    [`${period.sales.en} / ${period.sales.ar}`, data ? formatMoney(data.periodSales) : '', <CircleDollarSign />],
    [`${period.orders.en} / ${period.orders.ar}`, data ? data.periodOrders ?? MISSING_MONEY : '', <CalendarDays />],
    ['Pending Delivery / بانتظار التوصيل', data?.pendingDelivery ?? '', <Package />],
    ['Unpaid Orders / طلبات غير مدفوعة', data?.unpaidOrders ?? '', <Clock3 />],
    ['Partial Payments / دفعات جزئية', data?.partialPayments ?? '', <WalletCards />],
  ] as const;
  return <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{cards.map(([label, value, icon]) => <Card dense key={label}><div className="flex items-center justify-between text-slate-500"><p className="text-xs font-medium">{label}</p><span className="[&>svg]:h-4 [&>svg]:w-4">{icon}</span></div>{loading ? <Skeleton className="mt-3 h-7 w-24" /> : <p className="mt-2 text-xl font-bold tabular-nums text-slate-900">{value}</p>}</Card>)}</div>;
}
