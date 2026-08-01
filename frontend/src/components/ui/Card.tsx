import React from 'react';
import { cn } from '../../lib/cn';

export type CardVariant = 'default' | 'interactive' | 'flush';

const VARIANTS: Record<CardVariant, string> = {
  default: 'p-6',
  interactive: 'p-6 transition-shadow hover:border-brand-300 hover:shadow-md',
  /** No padding — for tables and other content that owns its own edges. */
  flush: 'overflow-hidden',
};

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
  /** Tightens padding for dense panels. Ignored by the `flush` variant. */
  dense?: boolean;
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(function Card(
  { variant = 'default', dense = false, className, children, ...props },
  ref
) {
  return (
    <div
      ref={ref}
      className={cn(
        'rounded-xl border border-slate-200 bg-white shadow-sm',
        VARIANTS[variant],
        dense && variant !== 'flush' && 'p-4',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
});

export interface CardHeaderProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Right-aligned slot for a link or button. */
  action?: React.ReactNode;
  icon?: React.ReactNode;
}

export const CardHeader: React.FC<CardHeaderProps> = ({
  title,
  description,
  action,
  icon,
  className,
  ...props
}) => (
  <div className={cn('mb-4 flex items-start justify-between gap-3', className)} {...props}>
    <div className="flex min-w-0 items-start gap-2.5">
      {icon && (
        <span className="mt-0.5 inline-flex shrink-0 text-slate-400 [&>svg]:h-5 [&>svg]:w-5" aria-hidden="true">
          {icon}
        </span>
      )}
      <div className="min-w-0">
        <h3 className="text-base font-semibold text-slate-900">{title}</h3>
        {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
      </div>
    </div>
    {action && <div className="shrink-0">{action}</div>}
  </div>
);
