import { Bar, BarChart, CartesianGrid, LabelList, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatMoney } from '../../../customer-financial/utils/financial-format';
import type { CustomerAnalyticsData } from '../../types';
import { ChartFrame } from './ChartFrame';
export function MonthlyComparisonChart({ data }: { data: CustomerAnalyticsData['monthlyComparison'] }) {
  const rows = data.map((row) => ({ ...row, collectedNumber: Number(row.collected), debtNumber: Number(row.newDebt) }));
  return <ChartFrame title={{ en: 'Monthly Comparison', ar: 'المقارنة الشهرية' }} rows={data} columns={[{ key: 'month', label: 'Month' }, { key: 'collected', label: 'Collected', format: (v) => formatMoney(String(v)) }, { key: 'newDebt', label: 'New debt', format: (v) => formatMoney(String(v)) }]}><ResponsiveContainer width="100%" height="100%"><BarChart data={rows} margin={{ top: 20, right: 12, left: 0, bottom: 2 }}><CartesianGrid stroke="var(--viz-grid)" vertical={false} /><XAxis dataKey="month" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} width={56} /><Tooltip formatter={(value) => formatMoney(Number(value).toFixed(2))} /><Legend /><Bar name="Collections" dataKey="collectedNumber" fill="var(--viz-blue)" radius={[3,3,0,0]}><LabelList position="top" fontSize={9} formatter={(value: unknown) => Number(value) ? Number(value).toFixed(0) : ''} /></Bar><Bar name="New debt" dataKey="debtNumber" fill="var(--viz-orange)" radius={[3,3,0,0]}><LabelList position="top" fontSize={9} formatter={(value: unknown) => Number(value) ? Number(value).toFixed(0) : ''} /></Bar></BarChart></ResponsiveContainer></ChartFrame>;
}

