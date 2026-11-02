import React from 'react';
import { cn } from '../../lib/cn';

export type BadgeTone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info';

/**
 * Soft pill: a translucent fill with a slightly stronger ring in the same hue,
 * so a badge reads correctly on white and on tinted panels alike. Every tone
 * keeps text at 700 so contrast holds on both.
 */
const TONES: Record<BadgeTone, string> = {
  neutral: 'bg-slate-500/10 text-slate-700 ring-slate-500/20',
  brand: 'bg-brand-500/15 text-brand-700 ring-brand-500/25',
  success: 'bg-green-500/15 text-green-700 ring-green-500/25',
  warning: 'bg-amber-500/15 text-amber-700 ring-amber-500/25',
  danger: 'bg-red-500/15 text-red-700 ring-red-500/25',
  info: 'bg-sky-500/15 text-sky-700 ring-sky-500/25',
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
      'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset',
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
