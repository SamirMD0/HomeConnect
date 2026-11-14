import { cva, type VariantProps } from 'class-variance-authority';
import { View, type ViewProps } from 'react-native';
import { cn } from '../../lib/utils';
import { Text, TextClassContext } from './text';

/** shadcn Badge in the PC's status colours. Always pair colour with words. */
const badgeVariants = cva('flex-row items-center self-start rounded-full px-2.5 py-0.5', {
  variants: {
    variant: {
      default: 'bg-brand-50',
      success: 'bg-emerald-50',
      warning: 'bg-amber-50',
      destructive: 'bg-red-50',
      outline: 'border border-border',
      secondary: 'bg-slate-100',
    },
  },
  defaultVariants: { variant: 'default' },
});
const badgeText = cva('font-sans-semibold text-xs', {
  variants: {
    variant: {
      default: 'text-brand-700',
      success: 'text-emerald-700',
      warning: 'text-amber-800',
      destructive: 'text-red-700',
      outline: 'text-foreground',
      secondary: 'text-slate-700',
    },
  },
  defaultVariants: { variant: 'default' },
});

export type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>['variant']>;

export function Badge({
  className,
  variant,
  label,
  children,
  ...props
}: ViewProps & VariantProps<typeof badgeVariants> & { className?: string; label?: string }) {
  return (
    <TextClassContext.Provider value={badgeText({ variant })}>
      <View className={cn(badgeVariants({ variant }), className)} {...props}>
        {label !== undefined ? <Text>{label}</Text> : children}
      </View>
    </TextClassContext.Provider>
  );
}
