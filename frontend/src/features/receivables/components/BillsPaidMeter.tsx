import React from 'react';

interface BillsPaidMeterProps {
  billsPaid: number;
  billsTotal: number;
  paidRatioPercent: string;
  /** Hides the percentage caption on narrow desktop widths. */
  compact?: boolean;
}

export const BillsPaidMeter: React.FC<BillsPaidMeterProps> = ({
  billsPaid,
  billsTotal,
  paidRatioPercent,
  compact = false,
}) => {
  if (billsTotal === 0) {
    return <span className="text-slate-400">—</span>;
  }

  const ratio = Number(paidRatioPercent);
  const width = Number.isFinite(ratio) ? Math.min(Math.max(ratio, 0), 100) : 0;
  const barClass = width >= 100 ? 'bg-emerald-500' : width >= 50 ? 'bg-blue-500' : 'bg-amber-500';

  return (
    <div className="min-w-[5.5rem]">
      <div className="flex items-baseline gap-1.5 tabular-nums">
        <span className="font-medium text-slate-700">
          {billsPaid}/{billsTotal}
        </span>
        {!compact && <span className="text-xs text-slate-500">{width}% paid</span>}
      </div>
      <div
        className="mt-1 h-1 w-full overflow-hidden rounded-full bg-slate-100"
        role="progressbar"
        aria-valuenow={width}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${billsPaid} of ${billsTotal} bills paid`}
      >
        <div className={`h-full rounded-full ${barClass}`} style={{ width: `${width}%` }} />
      </div>
    </div>
  );
};
