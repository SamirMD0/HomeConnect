import { Line, LineChart, ResponsiveContainer } from 'recharts';
export function KpiSparkline({ data }: { data: Array<{ bucket: string; value: string | number }> }) {
  if (data.length < 2) return <div className="h-8 w-16" aria-hidden="true" />;
  return <div className="h-8 w-16" aria-hidden="true"><ResponsiveContainer width="100%" height="100%"><LineChart data={data}><Line type="monotone" dataKey="value" stroke="#2a78d6" strokeWidth={2} dot={false} isAnimationActive={false} /></LineChart></ResponsiveContainer></div>;
}
