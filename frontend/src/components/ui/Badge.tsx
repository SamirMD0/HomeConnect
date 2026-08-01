import React from 'react';
import { cn } from '../../lib/cn';

export type BadgeTone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info';

/**
 * Soft fill + inset ring. Every tone keeps text at 700 so contrast holds on the
 * white card surface the badges sit on.
 */
const TONES: Record<BadgeTone, string> = {
  neutral: 'bg-slate-50 text-slate-700 ring-slate-600/15',
  brand: 'bg-brand-50 text-brand-700 ring-brand-600/20',
  success: 'bg-green-50 text-green-700 ring-green-600/20',
  warning: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  danger: 'bg-red-50 text-red-700 ring-red-600/20',
  info: 'bg-blue-50 text-blue-700 ring-blue-700/15',
};

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  /**
   * Optional leading icon. Status meaning must never rest on colour alone, so
   * pair a tone with either an icon or self-evident text.
   */
  icon?: React.ReactNode;
}

export const Badge: React.FC<BadgeProps> = ({ tone = 'neutral', icon, className, children, ...props }) => (
  <span
    className={cn(
      'inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset',
      TONES[tone],
      className
    )}
    {...props}
  >
    {icon && (
      <span className="inline-flex shrink-0 [&>svg]:h-3.5 [&>svg]:w-3.5" aria-hidden="true">
        {icon}
      </span>
    )}
    {children}
  </span>
);
