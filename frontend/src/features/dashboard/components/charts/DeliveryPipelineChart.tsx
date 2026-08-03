import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { SalesAnalyticsData } from '../../types';
import { FULFILLMENT_STATUS_LABELS } from '../../../sales-orders/utils/sales-order-labels';
import { ChartFrame } from './ChartFrame';

export function DeliveryPipelineChart({ data }: { data: SalesAnalyticsData['deliveryPipeline'] }) {
  const rows = data.map((row) => ({ ...row, label: FULFILLMENT_STATUS_LABELS[row.status as keyof typeof FULFILLMENT_STATUS_LABELS] ?? row.status }));
  return <ChartFrame title={{ en: 'Delivery Pipeline', ar: 'مسار التوصيل' }} rows={rows} columns={[{ key: 'label', label: 'Stage' }, { key: 'count', label: 'Orders' }]}><ResponsiveContainer width="100%" height="100%"><BarChart data={rows} layout="vertical" margin={{ top: 4, right: 38, left: 18, bottom: 2 }}><CartesianGrid stroke="var(--viz-grid)" horizontal={false} /><XAxis type="number" allowDecimals={false} /><YAxis type="category" dataKey="label" width={142} tick={{ fontSize: 10 }} /><Tooltip /><Bar dataKey="count" name="Orders" fill="var(--viz-aqua)" radius={[0, 3, 3, 0]}><LabelList dataKey="count" position="right" fontSize={10} /></Bar></BarChart></ResponsiveContainer></ChartFrame>;
}
