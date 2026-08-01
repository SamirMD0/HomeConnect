import React from 'react';
import { cn } from '../../lib/cn';
import { BilingualLabel, type BilingualText } from './BilingualLabel';

function isBilingual(value: React.ReactNode | BilingualText): value is BilingualText {
  return typeof value === 'object' && value !== null && 'en' in value && 'ar' in value;
}

export interface PageHeaderProps {
  title: React.ReactNode | BilingualText;
  description?: React.ReactNode;
  /** Right-aligned slot for primary page actions. */
  actions?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}

/**
 * Standard page title block. Every page should use this rather than declaring
 * its own heading markup — per-page improvisation is what makes an app look
 * assembled rather than designed.
 */
export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  description,
  actions,
  icon,
  className,
}) => (
  <div className={cn('flex flex-wrap items-end justify-between gap-4', className)}>
    <div className="flex min-w-0 items-start gap-3">
      {icon && (
        <span
          className="mt-1 inline-flex shrink-0 rounded-lg bg-brand-50 p-2 text-brand-600 [&>svg]:h-5 [&>svg]:w-5"
          aria-hidden="true"
        >
          {icon}
        </span>
      )}
      <div className="min-w-0">
        <h1 className="text-2xl font-bold text-slate-900">
          {isBilingual(title) ? <BilingualLabel label={title} compact /> : title}
        </h1>
        {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      </div>
    </div>
    {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
  </div>
);
