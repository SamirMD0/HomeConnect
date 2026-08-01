import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatMoney } from '../../../customer-financial/utils/financial-format';
import type { MonthEndMovement } from '../../types';
import { ChartFrame } from './ChartFrame';
export function DebtMovementChart({ data }: { data: MonthEndMovement }) {
  const rows = [
    { step: 'Opening', amount: Number(data.opening), display: data.opening, color: '#2a78d6' },
    { step: 'New', amount: Number(data.newAmount), display: data.newAmount, color: '#eb6834' },
    { step: 'Collected', amount: -Number(data.collected), display: `-${data.collected}`, color: '#2a78d6' },
    { step: 'Adjusted', amount: Number(data.adjustments), display: data.adjustments, color: '#e87ba4' },
    { step: 'Closing', amount: Number(data.closing), display: data.closing, color: data.reconciled ? '#1baf7a' : '#d03b3b' },
  ];
  return <ChartFrame title={{ en: 'Debt Movement', ar: 'حركة الديون' }} rows={rows} columns={[{ key: 'step', label: 'Movement' }, { key: 'display', label: 'Amount', format: (v) => formatMoney(String(v)) }]}><ResponsiveContainer width="100%" height="100%"><BarChart data={rows} margin={{ top: 24, right: 12, left: 0, bottom: 4 }}><CartesianGrid stroke="var(--viz-grid)" vertical={false} /><XAxis dataKey="step" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} width={60} /><Tooltip formatter={(value) => formatMoney(Number(value).toFixed(2))} /><Bar dataKey="amount" radius={[3,3,0,0]}>{rows.map((row) => <Cell key={row.step} fill={row.color} />)}<LabelList dataKey="display" position="top" fontSize={10} formatter={(value: unknown) => formatMoney(String(value))} /></Bar></BarChart></ResponsiveContainer></ChartFrame>;
}
