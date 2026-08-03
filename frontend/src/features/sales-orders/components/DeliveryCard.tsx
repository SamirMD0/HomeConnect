import { CheckCircle2, Circle, MapPin, Truck } from 'lucide-react';
import { Card, CardHeader } from '../../../components/ui';
import type { SalesOrder, SalesOrderFulfillmentStatus } from '../types/sales-orders.types';
import { FULFILLMENT_STATUS_LABELS } from '../utils/sales-order-labels';

const STAGES: SalesOrderFulfillmentStatus[] = ['CONFIRMED', 'PREPARING', 'READY_FOR_DELIVERY', 'OUT_FOR_DELIVERY', 'DELIVERED'];
export function DeliveryCard({ order }: { order: SalesOrder }) {
  if (order.salesChannel === 'SHOP_DIRECT') return null;
  const current = STAGES.indexOf(order.fulfillmentStatus);
  return <Card><CardHeader title="Delivery / التوصيل" icon={<Truck />} /><ol className="space-y-2">{STAGES.map((stage, index) => <li key={stage} className="flex items-center gap-2 text-sm">{index <= current ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <Circle className="h-4 w-4 text-slate-300" />}<span>{FULFILLMENT_STATUS_LABELS[stage]}</span></li>)}</ol><div className="mt-4 border-t border-slate-100 pt-4"><p className="text-xs text-slate-500">Planned date</p><p>{order.deliveryDate ?? '—'}</p><p className="mt-3 flex items-start gap-2 text-xs text-slate-500"><MapPin className="h-4 w-4 shrink-0" /><span className="user-text" dir="auto">{order.deliveryAddressSnapshot ?? 'No delivery address'}</span></p>{order.deliveryNotes && <p className="user-text mt-2 text-sm text-slate-600" dir="auto">{order.deliveryNotes}</p>}</div></Card>;
}
