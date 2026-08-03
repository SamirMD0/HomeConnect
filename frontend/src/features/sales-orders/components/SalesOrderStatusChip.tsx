import { CheckCircle2, CircleDashed, PackageCheck, PackageOpen, Truck, XCircle, RotateCcw, ClipboardCheck } from 'lucide-react';
import { Badge } from '../../../components/ui';
import type { SalesOrderFulfillmentStatus } from '../types/sales-orders.types';
import { FULFILLMENT_STATUS_LABELS } from '../utils/sales-order-labels';
import { FULFILLMENT_TONES } from '../utils/sales-order-status';

const ICONS: Record<SalesOrderFulfillmentStatus, React.ReactNode> = {
  DRAFT: <CircleDashed />, CONFIRMED: <ClipboardCheck />, PREPARING: <PackageOpen />,
  READY_FOR_DELIVERY: <PackageCheck />, OUT_FOR_DELIVERY: <Truck />, DELIVERED: <CheckCircle2 />,
  CANCELLED: <XCircle />, RETURNED: <RotateCcw />,
};
export const SalesOrderStatusChip = ({ status }: { status: SalesOrderFulfillmentStatus }) => <Badge tone={FULFILLMENT_TONES[status]} icon={ICONS[status]}>{FULFILLMENT_STATUS_LABELS[status]}</Badge>;
