import type { TextProps, ViewProps } from 'react-native';
import { View } from 'react-native';
import { cn } from '../../lib/utils';
import { Text, TextClassContext } from './text';

type Props = ViewProps & { className?: string };

/** shadcn Card: solid white panel on the glass page, like the PC's content panels. */
export function Card({ className, ...props }: Props) {
  return (
    <TextClassContext.Provider value="text-card-foreground">
      <View className={cn('rounded-xl border border-border bg-card shadow-sm shadow-slate-900/10', className)} {...props} />
    </TextClassContext.Provider>
  );
}
export function CardHeader({ className, ...props }: Props) {
  return <View className={cn('gap-1 px-4 pt-4', className)} {...props} />;
}
export function CardTitle({ className, ...props }: TextProps & { className?: string }) {
  return <Text accessibilityRole="header" className={cn('font-sans-bold text-lg text-foreground', className)} {...props} />;
}
export function CardDescription({ className, ...props }: TextProps & { className?: string }) {
  return <Text className={cn('text-sm text-muted-foreground', className)} {...props} />;
}
export function CardContent({ className, ...props }: Props) {
  return <View className={cn('gap-3 p-4', className)} {...props} />;
}
export function CardFooter({ className, ...props }: Props) {
  return <View className={cn('flex-row items-center gap-2 px-4 pb-4', className)} {...props} />;
}
