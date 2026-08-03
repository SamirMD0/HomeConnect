import { ExternalLink, Landmark, ListChecks } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Badge, Card, IconButton, Table } from '../../../components/ui';
import { formatBusinessDate, formatMoney } from '../../customer-financial/utils/financial-format';
import type { SalesOrder } from '../types/sales-orders.types';
import {
  salesOrderDisplayPaymentStatus,
  shouldShowSalesOrderSettlement,
} from '../utils/sales-order-status';
import { PaymentStatusChip } from './PaymentStatusChip';
import { SalesOrderStatusChip } from './SalesOrderStatusChip';

export function SalesOrdersTable({ orders }: { orders: SalesOrder[] }) {
  const navigate = useNavigate();
  const columns = [
    { header: 'Order', accessor: (order: SalesOrder) => <div><p className="font-semibold text-slate-900">{order.orderNumber}</p><p className="text-xs text-slate-500">{formatBusinessDate(order.orderDate)}</p></div> },
    { header: 'Customer', accessor: (order: SalesOrder) => <div dir="auto"><p className="user-text font-medium text-slate-900">{order.customer?.name ?? 'Customer'}</p>{order.customer && <p className="text-xs text-slate-500">{order.customer.phone}</p>}</div> },
    { header: 'Items', accessor: (order: SalesOrder) => <div><p className="user-text" dir="auto">{order.items[0]?.productNameSnapshot ?? '—'}{order.items.length > 1 ? ` +${order.items.length - 1}` : ''}</p><p className="text-xs text-slate-500">{order.items.reduce((sum, item) => sum + item.quantity, 0)} units</p></div> },
    { header: 'Total', accessor: (order: SalesOrder) => <span className="font-semibold tabular-nums">{formatMoney(order.totalAmount)}</span> },
    { header: 'Payment', accessor: (order: SalesOrder) => <div className="flex flex-wrap gap-1"><PaymentStatusChip status={salesOrderDisplayPaymentStatus(order)} />{shouldShowSalesOrderSettlement(order) && <Badge tone="info" icon={<Landmark />}>{order.settlement}</Badge>}</div> },
    { header: 'Fulfillment', accessor: (order: SalesOrder) => <SalesOrderStatusChip status={order.fulfillmentStatus} /> },
    { header: '', accessor: (order: SalesOrder) => <IconButton label={`Open ${order.orderNumber}`} icon={<ExternalLink />} onClick={(event) => { event.stopPropagation(); navigate(`/sales-orders/${order.id}`); }} /> },
  ];
  return <><div className="hidden md:block"><Table data={orders} columns={columns} keyExtractor={(order) => order.id} onRowClick={(order) => navigate(`/sales-orders/${order.id}`)} /></div><div className="space-y-3 md:hidden">{orders.map((order) => <Card variant="interactive" dense key={order.id} onClick={() => navigate(`/sales-orders/${order.id}`)}><div className="flex items-start justify-between gap-3"><div><p className="font-bold text-slate-900">{order.orderNumber}</p><p className="user-text text-sm text-slate-600" dir="auto">{order.customer?.name ?? 'Customer'}</p></div><SalesOrderStatusChip status={order.fulfillmentStatus} /></div><div className="mt-3 flex flex-wrap items-center gap-2"><PaymentStatusChip status={salesOrderDisplayPaymentStatus(order)} /><span className="font-semibold tabular-nums">{formatMoney(order.totalAmount)}</span></div><div className="mt-3 flex items-center gap-2 text-xs text-slate-500"><ListChecks className="h-4 w-4" />{order.items.length} lines · {formatBusinessDate(order.orderDate)}</div></Card>)}</div></>;
}
