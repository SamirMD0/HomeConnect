import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import type { BilingualText } from '../../config/dashboard-labels';
import { BilingualLabel } from './BilingualLabel';

export function DashboardSection({ title, icon: Icon, action, children, className = '' }: { title: BilingualText; icon: LucideIcon; action?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={`dashboard-section ${className}`}><header className="mb-4 flex min-w-0 items-center justify-between gap-3"><div className="flex min-w-0 items-center gap-2.5"><Icon className="h-5 w-5 shrink-0 text-emerald-600" aria-hidden="true" /><h2 className="text-base font-semibold text-slate-900"><BilingualLabel label={title} compact /></h2></div>{action}</header>{children}</section>;
}
