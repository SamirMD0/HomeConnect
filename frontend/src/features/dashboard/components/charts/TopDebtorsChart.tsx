import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatMoney } from '../../../customer-financial/utils/financial-format';
import type { CustomerAnalyticsData } from '../../types';
import { ChartFrame } from './ChartFrame';
export function TopDebtorsChart({ data }: { data: NonNullable<CustomerAnalyticsData['topDebtors']> }) {
  const rows = data.map((row) => ({ ...row, amount: Number(row.outstanding) }));
  return <ChartFrame title={{ en: 'Top Debtors', ar: 'أكبر المدينين' }} rows={data} columns={[{ key: 'customerName', label: 'Customer' }, { key: 'phone', label: 'Phone' }, { key: 'outstanding', label: 'Outstanding', format: (v) => formatMoney(String(v)) }]}><ResponsiveContainer width="100%" height="100%"><BarChart data={rows} layout="vertical" margin={{ top: 4, right: 55, left: 15, bottom: 2 }}><CartesianGrid stroke="var(--viz-grid)" horizontal={false} /><XAxis type="number" hide /><YAxis type="category" dataKey="customerName" width={100} tick={{ fontSize: 11 }} /><Tooltip formatter={(value) => formatMoney(Number(value).toFixed(2))} /><Bar dataKey="amount" name="Outstanding" fill="var(--viz-orange)" radius={[0,3,3,0]}><LabelList dataKey="amount" position="right" fontSize={10} formatter={(value: unknown) => formatMoney(Number(value).toFixed(2))} /></Bar></BarChart></ResponsiveContainer></ChartFrame>;
}

