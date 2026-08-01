import { Bar, BarChart, LabelList, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatMoney } from '../../../customer-financial/utils/financial-format';
import type { CustomerAnalyticsData } from '../../types';
import { ChartFrame } from './ChartFrame';
const colors = ['#b9d7f5', '#85b8ea', '#5598db', '#2a78d6', '#185ca9'];
export function DebtAgeDistributionChart({ data }: { data: CustomerAnalyticsData['ageDistribution'] }) {
  const chartRow = Object.fromEntries(data.map((bucket) => [bucket.key, Number(bucket.amount)]));
  return <ChartFrame title={{ en: 'Debt Age Distribution', ar: 'توزيع أعمار الديون' }} rows={data} columns={[{ key: 'label', label: 'Age' }, { key: 'count', label: 'Items' }, { key: 'amount', label: 'Amount', format: (v) => formatMoney(String(v)) }]} height={190}><ResponsiveContainer width="100%" height="100%"><BarChart data={[{ name: 'Customer debt', ...chartRow }]} layout="vertical" margin={{ top: 15, right: 15, left: 10, bottom: 5 }}><XAxis type="number" hide /><YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 11 }} /><Tooltip formatter={(value) => formatMoney(Number(value).toFixed(2))} /><Legend />{data.map((bucket, index) => <Bar key={bucket.key} dataKey={bucket.key} stackId="age" name={bucket.label} fill={colors[index]}><LabelList dataKey={bucket.key} position="center" fontSize={9} formatter={(value: unknown) => Number(value) ? Number(value).toFixed(0) : ''} /></Bar>)}</BarChart></ResponsiveContainer></ChartFrame>;
}

