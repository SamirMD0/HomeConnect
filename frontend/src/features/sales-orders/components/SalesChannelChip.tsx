import { Phone, ShoppingBag, Truck } from 'lucide-react';
import { Badge } from '../../../components/ui';
import type { SalesChannel } from '../types/sales-orders.types';
import { SALES_CHANNEL_LABELS } from '../utils/sales-order-labels';
const ICONS: Record<SalesChannel, React.ReactNode> = { SHOP_DIRECT: <ShoppingBag />, SHOP_DELIVERY: <Truck />, PHONE_ORDER: <Phone /> };
export const SalesChannelChip = ({ channel }: { channel: SalesChannel }) => <Badge tone="neutral" icon={ICONS[channel]}>{SALES_CHANNEL_LABELS[channel]}</Badge>;
