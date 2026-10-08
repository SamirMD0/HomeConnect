import { Line, LineChart } from 'recharts';
export function KpiSparkline({ data }: { data: Array<{ bucket: string; value: string | number }> }) {
  if (data.length < 2) return <div className="h-8 w-16" aria-hidden="true" />;
  return <div className="h-8 w-16 shrink-0" aria-hidden="true"><LineChart width={64} height={32} data={data}><Line type="monotone" dataKey="value" stroke="#2a78d6" strokeWidth={2} dot={false} isAnimationActive={false} /></LineChart></div>;
}
