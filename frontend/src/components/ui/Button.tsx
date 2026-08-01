import React from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '../../lib/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'link';
export type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-brand-600 text-white shadow-sm hover:bg-brand-700 focus-visible:ring-brand-500/50',
  secondary:
    'bg-white text-slate-700 border border-slate-300 shadow-sm hover:bg-slate-50 focus-visible:ring-brand-500/40',
  ghost: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus-visible:ring-slate-400/40',
  danger: 'bg-red-600 text-white shadow-sm hover:bg-red-700 focus-visible:ring-red-500/50',
  link: 'text-brand-700 underline-offset-4 hover:underline hover:text-brand-800 focus-visible:ring-brand-500/40',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5',
  md: 'h-9 px-4 text-sm gap-2',
  lg: 'h-11 px-5 text-sm gap-2',
};

const ICON_SIZES: Record<ButtonSize, string> = {
  sm: 'h-3.5 w-3.5',
  md: 'h-4 w-4',
  lg: 'h-4 w-4',
};

const BASE =
  'inline-flex shrink-0 items-center justify-center rounded-lg font-medium transition-colors ' +
  'focus-visible:outline-none focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50';

/**
 * Class string for the shared button treatment, exposed so non-<button>
 * elements (router `Link`, `<a>`) can wear the same style without us needing a
 * polymorphic `as` prop or a Radix `Slot`.
 */
export function buttonClasses(
  variant: ButtonVariant = 'primary',
  size: ButtonSize = 'md',
  className?: string
): string {
  return cn(BASE, VARIANTS[variant], variant === 'link' ? 'h-auto px-0' : SIZES[size], className);
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner and disables the button. */
  isLoading?: boolean;
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    isLoading = false,
    icon,
    iconPosition = 'left',
    disabled,
    className,
    children,
    type = 'button',
    ...props
  },
  ref
) {
  const iconClass = ICON_SIZES[size];
  const renderedIcon = isLoading ? (
    <Loader2 className={cn(iconClass, 'animate-spin')} aria-hidden="true" />
  ) : icon ? (
    <span className={cn(iconClass, 'inline-flex items-center justify-center [&>svg]:h-full [&>svg]:w-full')}>
      {icon}
    </span>
  ) : null;

  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || isLoading}
      aria-busy={isLoading || undefined}
      className={buttonClasses(variant, size, className)}
      {...props}
    >
      {iconPosition === 'left' && renderedIcon}
      {children}
      {iconPosition === 'right' && renderedIcon}
    </button>
  );
});

export interface IconButtonProps extends Omit<ButtonProps, 'icon' | 'iconPosition' | 'children'> {
  /** Required — an icon with no accessible name is unusable with a screen reader. */
  label: string;
  icon: React.ReactNode;
}

const ICON_BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 w-8',
  md: 'h-9 w-9',
  lg: 'h-11 w-11',
};

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, icon, variant = 'ghost', size = 'md', className, ...props },
  ref
) {
  return (
    <Button
      ref={ref}
      variant={variant}
      size={size}
      aria-label={label}
      title={label}
      className={cn('px-0', ICON_BUTTON_SIZES[size], className)}
      {...props}
    >
      <span className={cn(ICON_SIZES[size], 'inline-flex [&>svg]:h-full [&>svg]:w-full')}>{icon}</span>
    </Button>
  );
});
