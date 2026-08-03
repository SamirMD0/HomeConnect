import { Cell, Label, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import type { SalesAnalyticsData } from '../../types';
import { PAYMENT_STATUS_LABELS } from '../../../sales-orders/utils/sales-order-labels';
import { ChartFrame } from './ChartFrame';

const colors = ['var(--viz-orange)', 'var(--viz-yellow)', 'var(--viz-aqua)'];

export function SalesPaymentStatusDonut({ data }: { data: SalesAnalyticsData['paymentStatusDistribution'] }) {
  const rows = data.map((row) => ({ ...row, label: PAYMENT_STATUS_LABELS[row.status as keyof typeof PAYMENT_STATUS_LABELS] ?? row.status }));
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  return <ChartFrame title={{ en: 'Payment Status', ar: 'حالة الدفع' }} rows={rows} columns={[{ key: 'label', label: 'Status' }, { key: 'count', label: 'Orders' }]}><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={rows} dataKey="count" nameKey="label" innerRadius="48%" outerRadius="72%" paddingAngle={1}>{rows.map((row, index) => <Cell key={row.status} fill={colors[index % colors.length]} />)}<Label value={`${total} orders`} position="center" fontSize={16} fontWeight={700} /></Pie><Tooltip /></PieChart></ResponsiveContainer></ChartFrame>;
}
