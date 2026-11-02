import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import type { BilingualText } from '../../config/dashboard-labels';
import { BilingualLabel } from './BilingualLabel';
import { cn } from '../../../../lib/cn';

export interface DashboardSectionProps {
  title: BilingualText;
  icon: LucideIcon;
  /** Small right-aligned area for a link, refresh, or status pill. */
  action?: ReactNode;
  /** Optional subtitle rendered under the title in muted text. */
  subtitle?: BilingualText;
  /** Adds a small "Live" (or custom) badge to the header. */
  liveBadge?: ReactNode;
  children: ReactNode;
  className?: string;
}

/**
 * Every analytics chapter is a full-width band of the page, separated from the
 * next by a hairline and an alternating tint (`.dashboard-chapter` in
 * index.css) rather than by card chrome, so charts don't sit in boxes in boxes.
 */
export function DashboardSection({
  title,
  icon: Icon,
  action,
  subtitle,
  liveBadge,
  children,
  className,
}: DashboardSectionProps) {
  return (
    <section className={cn('dashboard-chapter', className)}>
      <header className="mb-6 flex min-w-0 flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-500/15 text-brand-700">
            <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-lg font-bold tracking-tight text-slate-900">
              <BilingualLabel label={title} compact />
            </h2>
            {subtitle && (
              <p className="mt-0.5 truncate text-sm text-slate-500">
                <BilingualLabel label={subtitle} compact />
              </p>
            )}
          </div>
          {liveBadge}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </header>
      {children}
    </section>
  );
}

/** Small "Live" pill for the section header — signals real-time data. */
export function LivePill({ label = 'Live' }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" aria-hidden="true" />
      {label}
    </span>
  );
}
