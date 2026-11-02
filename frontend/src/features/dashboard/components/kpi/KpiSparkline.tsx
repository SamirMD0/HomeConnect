import { Line, LineChart } from 'recharts';

export function KpiSparkline({
  data,
  width = 64,
  height = 32,
}: {
  data: Array<{ bucket: string; value: string | number }>;
  width?: number;
  height?: number;
}) {
  const box = { width, height };
  if (data.length < 2) return <div style={box} aria-hidden="true" />;
  const rows = data.map((point) => ({ ...point, value: Number(point.value) }));
  return (
    <div className="viz-root shrink-0" style={box} aria-hidden="true">
      <LineChart width={width} height={height} data={rows}>
        <Line type="monotone" dataKey="value" stroke="var(--viz-blue)" strokeWidth={2} dot={false} isAnimationActive={false} />
      </LineChart>
    </div>
  );
}
