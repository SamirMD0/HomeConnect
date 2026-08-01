import type { BilingualText } from '../../config/dashboard-labels';

export function BilingualLabel({ label, compact = false }: { label: BilingualText; compact?: boolean }) {
  return <span className={compact ? 'inline-flex flex-wrap items-baseline gap-x-1.5' : 'flex flex-col'}><span>{label.en}</span><span dir="rtl" className={compact ? 'text-[0.86em] text-slate-500' : 'text-xs font-normal text-slate-500'}>{label.ar}</span></span>;
}
