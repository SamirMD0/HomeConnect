import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { ActivityIndicator, Pressable } from 'react-native';
import { cn } from '../../lib/utils';
import { TextClassContext } from './text';

/** shadcn Button, with the PC's colours. One `default` (filled blue) per screen. */
export const buttonVariants = cva(
  'flex-row items-center justify-center gap-2 rounded-lg active:opacity-85',
  {
    variants: {
      variant: {
        default: 'bg-primary',
        success: 'bg-emerald-600',
        destructive: 'bg-destructive',
        outline: 'border border-input bg-card active:bg-slate-50',
        secondary: 'bg-brand-50 active:bg-brand-100',
        ghost: 'active:bg-slate-100',
        link: '',
      },
      size: {
        default: 'h-12 px-5',
        sm: 'h-10 px-3.5',
        lg: 'h-14 px-6',
        icon: 'h-12 w-12',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  }
);

export const buttonTextVariants = cva('font-sans-semibold text-base', {
  variants: {
    variant: {
      default: 'text-primary-foreground',
      success: 'text-white',
      destructive: 'text-white',
      outline: 'text-foreground',
      secondary: 'text-brand-700',
      ghost: 'text-foreground',
      link: 'text-primary underline',
    },
    size: { default: '', sm: 'text-sm', lg: 'text-lg', icon: '' },
  },
  defaultVariants: { variant: 'default', size: 'default' },
});

export type ButtonProps = ComponentProps<typeof Pressable> &
  VariantProps<typeof buttonVariants> & { className?: string; loading?: boolean };

export function Button({ className, variant, size, loading, disabled, children, ...props }: ButtonProps) {
  const unavailable = Boolean(disabled || loading);
  const onFill = variant === undefined || variant === 'default' || variant === 'success' || variant === 'destructive';
  return (
    <TextClassContext.Provider value={buttonTextVariants({ variant, size })}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: unavailable, busy: Boolean(loading) }}
        disabled={unavailable}
        className={cn(buttonVariants({ variant, size }), unavailable && 'opacity-50', className)}
        {...props}
      >
        {(state) => (
          <>
            {loading ? <ActivityIndicator size="small" color={onFill ? '#fff' : '#1A6FC9'} /> : null}
            {typeof children === 'function' ? children(state) : children}
          </>
        )}
      </Pressable>
    </TextClassContext.Provider>
  );
}
