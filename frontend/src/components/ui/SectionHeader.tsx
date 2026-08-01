import React from 'react';
import { cn } from '../../lib/cn';
import { BilingualLabel, type BilingualText } from './BilingualLabel';

function isBilingual(value: React.ReactNode | BilingualText): value is BilingualText {
  return typeof value === 'object' && value !== null && 'en' in value && 'ar' in value;
}

export interface SectionHeaderProps {
  title: React.ReactNode | BilingualText;
  description?: React.ReactNode;
  /** Right-aligned slot — usually a "view all" link or a small action. */
  action?: React.ReactNode;
  icon?: React.ReactNode;
  /** Adds the top divider used to separate stacked page sections. */
  divided?: boolean;
  className?: string;
}

export const SectionHeader: React.FC<SectionHeaderProps> = ({
  title,
  description,
  action,
  icon,
  divided = false,
  className,
}) => (
  <header
    className={cn(
      'flex min-w-0 flex-wrap items-center justify-between gap-3',
      divided && 'border-t border-slate-200 pt-5',
      className
    )}
  >
    <div className="flex min-w-0 items-center gap-2.5">
      {icon && (
        <span className="inline-flex shrink-0 text-brand-600 [&>svg]:h-5 [&>svg]:w-5" aria-hidden="true">
          {icon}
        </span>
      )}
      <div className="min-w-0">
        <h2 className="text-base font-semibold text-slate-900">
          {isBilingual(title) ? <BilingualLabel label={title} compact /> : title}
        </h2>
        {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
      </div>
    </div>
    {action && <div className="shrink-0">{action}</div>}
  </header>
);
