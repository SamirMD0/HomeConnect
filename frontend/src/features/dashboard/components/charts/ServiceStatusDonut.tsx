import { Cell, Label, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import type { ServiceAnalyticsData } from '../../types';
import { ChartFrame } from './ChartFrame';
const colors = ['#2a78d6','#eb6834','#1baf7a','#eda100','#e87ba4','#7c6bb1','#509ca8','#0ca30c','#d03b3b','#898781'];
export function ServiceStatusDonut({ data }: { data: ServiceAnalyticsData['statusDistribution'] }) {
  const total = data.reduce((sum, item) => sum + item.count, 0);
  return <ChartFrame title={{ en: 'Service Status Distribution', ar: 'توزيع حالات الصيانة' }} rows={data} columns={[{ key: 'label', label: 'Status' }, { key: 'count', label: 'Jobs' }]}><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={data} dataKey="count" nameKey="label" innerRadius="48%" outerRadius="72%" paddingAngle={1} label={({ name, value }) => `${name}: ${value}`} labelLine>{data.map((row, index) => <Cell key={row.status} fill={colors[index % colors.length]} />)}<Label value={`${total} jobs`} position="center" fontSize={18} fontWeight={700} /></Pie><Tooltip /></PieChart></ResponsiveContainer></ChartFrame>;
}

