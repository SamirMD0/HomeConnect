import { CartesianGrid, LabelList, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatMoney } from '../../../customer-financial/utils/financial-format';
import type { CustomerAnalyticsData } from '../../types';
import { ChartFrame } from './ChartFrame';

export function CollectionsVsDebtChart({ data }: { data: CustomerAnalyticsData['trend'] }) {
  const rows = data.map((row) => ({ ...row, collectedNumber: Number(row.collected), debtNumber: Number(row.newDebt) }));
  return <ChartFrame title={{ en: 'Collections vs New Debt', ar: 'التحصيل مقابل الديون الجديدة' }} rows={data} columns={[{ key: 'bucket', label: 'Period' }, { key: 'collected', label: 'Collected', format: (value) => formatMoney(String(value)) }, { key: 'newDebt', label: 'New debt', format: (value) => formatMoney(String(value)) }]}><ResponsiveContainer width="100%" height="100%"><LineChart data={rows} margin={{ top: 18, right: 18, left: 0, bottom: 4 }}><CartesianGrid stroke="var(--viz-grid)" vertical={false} /><XAxis dataKey="bucket" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} width={56} /><Tooltip formatter={(value) => formatMoney(Number(value).toFixed(2))} /><Legend /><Line name="Collections" type="monotone" dataKey="collectedNumber" stroke="var(--viz-blue)" strokeWidth={2} dot={false}><LabelList dataKey="collectedNumber" position="top" fontSize={9} formatter={(value: unknown) => Number(value) > 0 ? Number(value).toFixed(0) : ''} /></Line><Line name="New debt" type="monotone" dataKey="debtNumber" stroke="var(--viz-orange)" strokeWidth={2} dot={false}><LabelList dataKey="debtNumber" position="bottom" fontSize={9} formatter={(value: unknown) => Number(value) > 0 ? Number(value).toFixed(0) : ''} /></Line></LineChart></ResponsiveContainer></ChartFrame>;
}

