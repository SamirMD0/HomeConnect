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
 * Every analytics chapter renders as a bordered card with a 3px emerald
 * accent flush to the left edge, matching the sidebar active-state stripe
 * so the whole app speaks one visual language. Section headers get room to
 * breathe: icon, bilingual title, optional Arabic-supported subtitle, and a
 * right-aligned action or "Live" pill.
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
    <section
      className={cn(
        'dashboard-chapter relative overflow-hidden rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5',
        'before:absolute before:inset-y-3 before:left-0 before:w-[3px] before:rounded-r-full before:bg-emerald-500',
        className
      )}
    >
      <header className="mb-4 flex min-w-0 flex-wrap items-center justify-between gap-3 pl-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100">
            <Icon className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-slate-900">
              <BilingualLabel label={title} compact />
            </h2>
            {subtitle && (
              <p className="mt-0.5 truncate text-xs text-slate-500">
                <BilingualLabel label={subtitle} compact />
              </p>
            )}
          </div>
          {liveBadge}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </header>
      <div className="pl-2">{children}</div>
    </section>
  );
}

/** Small "Live" pill for the section header — signals real-time data. */
export function LivePill({ label = 'Live' }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-800">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" aria-hidden="true" />
      {label}
    </span>
  );
}
