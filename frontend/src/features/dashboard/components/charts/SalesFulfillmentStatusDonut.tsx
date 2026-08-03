import { Cell, Label, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import type { SalesAnalyticsData } from '../../types';
import { FULFILLMENT_STATUS_LABELS } from '../../../sales-orders/utils/sales-order-labels';
import { ChartFrame } from './ChartFrame';

const colors = ['var(--viz-blue)', 'var(--viz-yellow)', 'var(--viz-orange)', 'var(--viz-aqua)', 'var(--viz-magenta)'];

export function SalesFulfillmentStatusDonut({ data }: { data: SalesAnalyticsData['fulfillmentStatusDistribution'] }) {
  const rows = data.map((row) => ({ ...row, label: FULFILLMENT_STATUS_LABELS[row.status as keyof typeof FULFILLMENT_STATUS_LABELS] ?? row.status }));
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  return <ChartFrame title={{ en: 'Fulfillment Status', ar: 'حالة التنفيذ' }} rows={rows} columns={[{ key: 'label', label: 'Status' }, { key: 'count', label: 'Orders' }]}><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={rows} dataKey="count" nameKey="label" innerRadius="48%" outerRadius="72%" paddingAngle={1}>{rows.map((row, index) => <Cell key={row.status} fill={colors[index % colors.length]} />)}<Label value={`${total} orders`} position="center" fontSize={16} fontWeight={700} /></Pie><Tooltip /></PieChart></ResponsiveContainer></ChartFrame>;
}
