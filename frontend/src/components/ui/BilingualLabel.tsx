import React from 'react';
import { cn } from '../../lib/cn';

export interface BilingualText {
  en: string;
  ar: string;
}

export interface BilingualLabelProps {
  label: BilingualText;
  /** Inline `English / عربي` instead of stacked. Use in nav and buttons. */
  compact?: boolean;
  className?: string;
}

/**
 * Renders an English label with its Arabic counterpart.
 *
 * `dir="rtl"` goes on the Arabic span ONLY. Putting direction on a container
 * flips the whole line, which can render `Model: SJ-PV69G` as `SJ-PV69G :Model`.
 * The app itself stays LTR — Arabic here is label text, not a layout direction.
 */
export const BilingualLabel: React.FC<BilingualLabelProps> = ({ label, compact = false, className }) => (
  <span className={cn(compact ? 'inline-flex flex-wrap items-baseline gap-x-1.5' : 'flex flex-col', className)}>
    <span>{label.en}</span>
    <span
      dir="rtl"
      className={compact ? 'text-[0.86em] text-slate-500' : 'text-xs font-normal text-slate-500'}
    >
      {label.ar}
    </span>
  </span>
);
