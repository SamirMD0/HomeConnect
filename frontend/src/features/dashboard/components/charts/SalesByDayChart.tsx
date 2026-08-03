import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatMoney } from '../../../customer-financial/utils/financial-format';
import type { SalesAnalyticsData } from '../../types';
import { ChartFrame } from './ChartFrame';

export function SalesByDayChart({ data }: { data: SalesAnalyticsData['salesByDay'] }) {
  const rows = data.map((row) => ({ ...row, amountNumber: Number(row.amount) }));
  return <ChartFrame title={{ en: 'Sales by Day', ar: 'المبيعات حسب اليوم' }} rows={data} columns={[{ key: 'date', label: 'Date' }, { key: 'amount', label: 'Sales', format: (value) => formatMoney(String(value)) }, { key: 'orderCount', label: 'Orders' }]} height={300}><ResponsiveContainer width="100%" height="100%"><BarChart data={rows} margin={{ top: 22, right: 12, left: 0, bottom: 4 }}><CartesianGrid stroke="var(--viz-grid)" vertical={false} /><XAxis dataKey="date" tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 11 }} width={56} /><Tooltip formatter={(value) => formatMoney(Number(value).toFixed(2))} /><Bar dataKey="amountNumber" name="Sales" fill="var(--viz-blue)" radius={[3, 3, 0, 0]}><LabelList dataKey="amountNumber" position="top" fontSize={9} formatter={(value: unknown) => Number(value) > 0 ? Number(value).toFixed(0) : ''} /></Bar></BarChart></ResponsiveContainer></ChartFrame>;
}
