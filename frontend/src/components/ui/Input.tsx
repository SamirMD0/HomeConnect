import React from 'react';
import { cn } from '../../lib/cn';

export const controlClasses = (invalid?: boolean, className?: string) =>
  cn(
    'w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-900 shadow-sm transition-colors',
    'placeholder:text-slate-400 focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500',
    invalid
      ? 'border-red-400 focus:border-red-500 focus:ring-red-500/30'
      : 'border-slate-300 focus:border-brand-500 focus:ring-brand-500/40',
    className
  );

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Right-align with tabular figures. Use for money and quantities. */
  numeric?: boolean;
  /**
   * Applies `.user-text-input` (unicode-bidi: plaintext) for free-text the user
   * types — names, notes. Do NOT use for money, dates, SKUs or barcodes, where
   * bidi reordering can move a minus sign or split a code.
   */
  userText?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  { numeric = false, userText = false, className, ...props },
  ref
) {
  return (
    <input
      ref={ref}
      className={controlClasses(
        props['aria-invalid'] === true,
        cn(numeric && 'text-right tabular-nums', userText && 'user-text-input', className)
      )}
      {...props}
    />
  );
});
