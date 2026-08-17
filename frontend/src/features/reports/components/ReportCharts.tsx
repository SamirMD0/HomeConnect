import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatMoney } from '../../customer-financial/utils/financial-format';
import { ChartFrame } from '../../dashboard/components/charts/ChartFrame';

export function TopSupplierBalancesChart({ data }: { data: Array<{ supplierName: string; balance: string }> }) {
  const chartRows = data.slice(0, 5).map((row) => ({ ...row, amount: Number(row.balance) }));
  return <ChartFrame title={{ en: 'Top Supplier Balances', ar: 'أكبر أرصدة الموردين' }} rows={data} columns={[{ key: 'supplierName', label: 'Supplier' }, { key: 'balance', label: 'Balance', format: (value) => formatMoney(String(value)) }]}><ResponsiveContainer width="100%" height="100%"><BarChart data={chartRows} layout="vertical" margin={{ top: 4, right: 55, left: 15, bottom: 2 }}><CartesianGrid stroke="var(--viz-grid)" horizontal={false} /><XAxis type="number" hide /><YAxis type="category" dataKey="supplierName" width={110} tick={{ fontSize: 10 }} /><Tooltip formatter={(value) => formatMoney(Number(value).toFixed(2))} /><Bar dataKey="amount" name="Balance" fill="var(--viz-orange)" radius={[0, 3, 3, 0]}><LabelList dataKey="amount" position="right" fontSize={10} formatter={(value: unknown) => formatMoney(Number(value).toFixed(2))} /></Bar></BarChart></ResponsiveContainer></ChartFrame>;
}

export function StockMovementsByTypeChart({ data }: { data: Array<{ type: string; count: number; quantityChange: number }> }) {
  return <ChartFrame title={{ en: 'Stock Movements by Type', ar: 'حركات المخزون حسب النوع' }} rows={data} columns={[{ key: 'type', label: 'Type' }, { key: 'count', label: 'Movements' }, { key: 'quantityChange', label: 'Net quantity' }]} height={300}><ResponsiveContainer width="100%" height="100%"><BarChart data={data} margin={{ top: 22, right: 12, left: 0, bottom: 60 }}><CartesianGrid stroke="var(--viz-grid)" vertical={false} /><XAxis dataKey="type" angle={-35} textAnchor="end" interval={0} tick={{ fontSize: 9 }} /><YAxis allowDecimals={false} width={42} /><Tooltip /><Bar dataKey="count" name="Movements" fill="var(--viz-blue)" radius={[3, 3, 0, 0]}><LabelList dataKey="count" position="top" fontSize={9} /></Bar></BarChart></ResponsiveContainer></ChartFrame>;
}
