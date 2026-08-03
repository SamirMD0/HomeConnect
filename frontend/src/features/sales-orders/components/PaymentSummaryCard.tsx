import { Landmark, ReceiptText, WalletCards } from 'lucide-react';
import { Badge, Card, CardHeader } from '../../../components/ui';
import { formatMoney } from '../../customer-financial/utils/financial-format';
import type { SalesOrder } from '../types/sales-orders.types';
import { SETTLEMENT_LABELS } from '../utils/sales-order-labels';
import { PaymentStatusChip } from './PaymentStatusChip';

export function PaymentSummaryCard({ order, actions }: { order: SalesOrder; actions?: React.ReactNode }) {
  return <Card><CardHeader title="Payment / الدفع" icon={<WalletCards />} action={actions} /><div className="grid grid-cols-3 gap-3"><Money label="Total" value={order.totalAmount} /><Money label="Paid at sale" value={order.paidAmount} /><Money label="Remaining" value={order.remainingAmount} /></div><div className="mt-4 flex flex-wrap gap-2"><PaymentStatusChip status={order.paymentStatus} /><Badge tone={order.settlement === 'NONE' ? 'neutral' : 'info'} icon={order.settlement === 'DEBT' ? <Landmark /> : <ReceiptText />}>{SETTLEMENT_LABELS[order.settlement]}</Badge></div>{order.debt && <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3"><p className="text-sm font-semibold">Debt {formatMoney(order.debt.originalAmount)}</p><p className="text-xs text-slate-500">Due {order.debt.dueDate} · {order.debt.status}</p></div>}{order.installmentPlan && <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3"><p className="text-sm font-semibold">Installment plan {formatMoney(order.installmentPlan.totalAmount)}</p><p className="text-xs text-slate-500">Starts {order.installmentPlan.startDate} · {order.installmentPlan.status}</p></div>}</Card>;
}
function Money({ label, value }: { label: string; value: string }) { return <div><p className="text-xs text-slate-500">{label}</p><p className="font-semibold tabular-nums text-slate-900">{formatMoney(value)}</p></div>; }
