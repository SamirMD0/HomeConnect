import { Pressable, ScrollView, View } from 'react-native';
import { cn } from '../../lib/utils';
import { Text } from './text';

/**
 * shadcn ToggleGroup as a pill row (This month · Last month · ...). Scrolls
 * sideways when the options do not fit, so labels are never cut.
 */
export function ToggleGroup<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} accessibilityLabel={label}>
      <View accessibilityRole="tablist" className="flex-row gap-1 rounded-full border border-white/70 bg-white/60 p-1">
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              onPress={() => onChange(option.value)}
              className={cn('h-10 justify-center rounded-full px-4', selected ? 'bg-primary' : 'active:bg-brand-50')}
            >
              <Text className={cn('text-sm', selected ? 'font-sans-semibold text-white' : 'font-sans-medium text-slate-700')}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}
