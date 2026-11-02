import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatMoney } from '../../../customer-financial/utils/financial-format';
import type { SalesAnalyticsData } from '../../types';
import { ChartFrame } from './ChartFrame';

export function SalesByDayChart({ data }: { data: SalesAnalyticsData['salesByDay'] }) {
  const rows = data.map((row) => ({ ...row, amountNumber: Number(row.amount) }));
  return (
    <ChartFrame
      title={{ en: 'Sales by Day', ar: 'المبيعات حسب اليوم' }}
      subtitle="Sales for each day in the selected range"
      rows={data}
      columns={[
        { key: 'date', label: 'Date' },
        { key: 'amount', label: 'Sales', format: (value) => formatMoney(String(value)) },
        { key: 'orderCount', label: 'Orders' },
      ]}
      height={300}
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={rows} margin={{ top: 12, right: 12, left: 0, bottom: 4 }}>
          <defs>
            <linearGradient id="sales-by-day-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--viz-blue)" stopOpacity={0.22} />
              <stop offset="100%" stopColor="var(--viz-blue)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--viz-grid)" vertical={false} />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={24} />
          <YAxis tick={{ fontSize: 11 }} width={56} tickLine={false} axisLine={false} />
          <Tooltip formatter={(value) => formatMoney(Number(value).toFixed(2))} />
          <Area
            type="monotone"
            dataKey="amountNumber"
            name="Sales"
            stroke="var(--viz-blue)"
            strokeWidth={2}
            fill="url(#sales-by-day-fill)"
            dot={rows.length <= 2 ? { r: 4, fill: 'var(--viz-blue)' } : false}
            activeDot={{ r: 5, strokeWidth: 2, stroke: '#ffffff' }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
