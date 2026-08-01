import React from 'react';
import { cn } from '../../lib/cn';

export type SkeletonProps = React.HTMLAttributes<HTMLDivElement>;

/**
 * Placeholder block. Size it to match the content it stands in for — a skeleton
 * with different dimensions than the real thing just moves the layout shift
 * rather than removing it.
 */
export const Skeleton: React.FC<SkeletonProps> = ({ className, ...props }) => (
  <div
    aria-hidden="true"
    className={cn('animate-pulse rounded-md bg-slate-200/70 motion-reduce:animate-none', className)}
    {...props}
  />
);

export interface SkeletonTextProps {
  /** Number of lines to render. */
  lines?: number;
  className?: string;
}

export const SkeletonText: React.FC<SkeletonTextProps> = ({ lines = 3, className }) => (
  <div className={cn('space-y-2', className)}>
    {Array.from({ length: lines }, (_, index) => (
      <Skeleton
        key={index}
        className={cn('h-4', index === lines - 1 && lines > 1 ? 'w-2/3' : 'w-full')}
      />
    ))}
  </div>
);

export interface SkeletonTableProps {
  rows?: number;
  columns?: number;
  className?: string;
}

/** Table placeholder that keeps column count so header widths stay stable. */
export const SkeletonTable: React.FC<SkeletonTableProps> = ({ rows = 5, columns = 4, className }) => (
  <div className={cn('divide-y divide-slate-100', className)}>
    {Array.from({ length: rows }, (_, rowIndex) => (
      <div key={rowIndex} className="flex items-center gap-4 px-4 py-3">
        {Array.from({ length: columns }, (_, columnIndex) => (
          <Skeleton key={columnIndex} className={cn('h-4 flex-1', columnIndex === 0 && 'max-w-[35%]')} />
        ))}
      </div>
    ))}
  </div>
);
