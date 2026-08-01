import { Area, AreaChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatMoney } from '../../../customer-financial/utils/financial-format';
import type { SupplierAnalyticsData } from '../../types';
import { ChartFrame } from './ChartFrame';
export function SupplierPaymentTrendChart({ data }: { data: SupplierAnalyticsData['trend'] }) {
  const rows = data.map((row) => ({ ...row, amount: Number(row.paid) }));
  return <ChartFrame title={{ en: 'Supplier Payment Trend', ar: 'اتجاه دفعات المورّدين' }} rows={data} columns={[{ key: 'bucket', label: 'Period' }, { key: 'paid', label: 'Paid', format: (v) => formatMoney(String(v)) }]}><ResponsiveContainer width="100%" height="100%"><AreaChart data={rows} margin={{ top: 20, right: 18, left: 0, bottom: 4 }}><CartesianGrid stroke="var(--viz-grid)" vertical={false} /><XAxis dataKey="bucket" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} width={56} /><Tooltip formatter={(value) => formatMoney(Number(value).toFixed(2))} /><Area name="Supplier payments" type="monotone" dataKey="amount" stroke="var(--viz-aqua)" fill="var(--viz-aqua-soft)" strokeWidth={2}><LabelList dataKey="amount" position="top" fontSize={9} formatter={(value: unknown) => Number(value) ? Number(value).toFixed(0) : ''} /></Area></AreaChart></ResponsiveContainer></ChartFrame>;
}

