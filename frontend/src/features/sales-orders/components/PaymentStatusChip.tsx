import { CheckCircle2, CircleDollarSign, WalletCards } from 'lucide-react';
import { Badge } from '../../../components/ui';
import type { SalesOrderPaymentStatus } from '../types/sales-orders.types';
import { PAYMENT_STATUS_LABELS } from '../utils/sales-order-labels';
import { PAYMENT_TONES } from '../utils/sales-order-status';
const ICONS: Record<SalesOrderPaymentStatus, React.ReactNode> = { UNPAID: <CircleDollarSign />, PARTIALLY_PAID: <WalletCards />, PAID: <CheckCircle2 /> };
export const PaymentStatusChip = ({ status }: { status: SalesOrderPaymentStatus }) => <Badge tone={PAYMENT_TONES[status]} icon={ICONS[status]}>{PAYMENT_STATUS_LABELS[status]}</Badge>;
