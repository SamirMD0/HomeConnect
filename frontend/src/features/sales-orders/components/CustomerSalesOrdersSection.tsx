import { Plus, ShoppingCart } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Badge, Card, CardHeader, EmptyState, SkeletonText, buttonClasses } from '../../../components/ui';
import { formatBusinessDate, formatMoney } from '../../customer-financial/utils/financial-format';
import { useCustomerSalesOrders } from '../hooks/useSalesOrders';
import { PaymentStatusChip } from './PaymentStatusChip';
import { salesOrderDisplayPaymentStatus } from '../utils/sales-order-status';

export function CustomerSalesOrdersSection({ customerId }: { customerId: string }) {
  const orders = useCustomerSalesOrders(customerId, { pageSize: 5, sort: 'createdDesc' });
  return <Card><CardHeader title="Sales Orders / طلبات البيع" icon={<ShoppingCart />} action={<Link to="/sales-orders?action=add" className={buttonClasses('secondary', 'sm')}><Plus className="h-4 w-4" /> Add order</Link>} />{orders.isLoading ? <SkeletonText lines={5} /> : orders.data?.items.length ? <div className="divide-y divide-slate-100">{orders.data.items.map((order) => <Link key={order.id} to={`/sales-orders/${order.id}`} className="flex flex-col gap-2 py-3 hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold text-slate-900">{order.orderNumber}</p><p className="text-sm text-slate-500">{formatBusinessDate(order.orderDate)} · {formatMoney(order.totalAmount)}</p></div><div className="flex gap-2"><PaymentStatusChip status={salesOrderDisplayPaymentStatus(order)} /><Badge>{order.fulfillmentStatus}</Badge></div></Link>)}</div> : <EmptyState title="No sales orders" description="This customer has no recorded sales yet." />}{(orders.data?.pagination.totalItems ?? 0) > 5 && <Link to={`/sales-orders?customerId=${customerId}`} className={buttonClasses('link', 'sm', 'mt-4')}>View all sales orders</Link>}</Card>;
}
