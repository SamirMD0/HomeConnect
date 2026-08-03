import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { SalesAnalyticsData } from '../../types';
import { ChartFrame } from './ChartFrame';

export function TopProductsSoldChart({ data }: { data: SalesAnalyticsData['topProducts'] }) {
  return <ChartFrame title={{ en: 'Top Products Sold', ar: 'المنتجات الأكثر مبيعاً' }} subtitle="Catalog products only / منتجات الكتالوج فقط" rows={data} columns={[{ key: 'productName', label: 'Product' }, { key: 'quantity', label: 'Quantity' }]}><ResponsiveContainer width="100%" height="100%"><BarChart data={data} layout="vertical" margin={{ top: 4, right: 38, left: 18, bottom: 2 }}><CartesianGrid stroke="var(--viz-grid)" horizontal={false} /><XAxis type="number" allowDecimals={false} /><YAxis type="category" dataKey="productName" width={125} tick={{ fontSize: 10 }} /><Tooltip /><Bar dataKey="quantity" name="Quantity" fill="var(--viz-magenta)" radius={[0, 3, 3, 0]}><LabelList dataKey="quantity" position="right" fontSize={10} /></Bar></BarChart></ResponsiveContainer></ChartFrame>;
}
