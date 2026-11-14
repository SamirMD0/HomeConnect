import { useEffect, useRef } from 'react';
import { Animated, View, type ViewProps } from 'react-native';
import { cn } from '../../lib/utils';

type Props = ViewProps & { className?: string };

/** shadcn Separator. */
export function Separator({ className, orientation = 'horizontal', ...props }: Props & { orientation?: 'horizontal' | 'vertical' }) {
  return (
    <View
      accessibilityRole="none"
      className={cn('bg-border', orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px', className)}
      {...props}
    />
  );
}

/** shadcn Skeleton: a soft pulse while data loads. */
export function Skeleton({ className, ...props }: Props) {
  const opacity = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.5, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return (
    <Animated.View style={{ opacity }}>
      <View className={cn('rounded-lg bg-slate-200', className)} {...props} />
    </Animated.View>
  );
}
