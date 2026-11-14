import * as SelectPrimitive from '@rn-primitives/select';
import { Check, ChevronDown, type LucideIcon } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { cn } from '../../lib/utils';
import { Text } from './text';

export type SelectOption = { value: string; label: string };

/**
 * shadcn Select (react-native-reusables shape) on @rn-primitives. The visible
 * parts are our own views passed with asChild, so styling never depends on a
 * library forwarding className.
 */
export function Select({
  value,
  options,
  onChange,
  placeholder = 'Choose',
  label,
  icon: Icon,
  className,
  triggerClassName,
  disabled,
}: {
  value: string | null;
  options: SelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  /** Accessible name; also shown above the field when `showLabel`. */
  label: string;
  icon?: LucideIcon;
  className?: string;
  triggerClassName?: string;
  disabled?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const selected = options.find((option) => option.value === value);
  return (
    <SelectPrimitive.Root
      value={selected}
      onValueChange={(option) => option && onChange(option.value)}
      disabled={disabled}
      className={className}
    >
      <SelectPrimitive.Trigger asChild>
        <Pressable
          accessibilityRole="combobox"
          accessibilityLabel={`${label}: ${selected?.label ?? placeholder}`}
          className={cn(
            'h-12 flex-row items-center gap-2 rounded-lg border border-input bg-card px-3 active:bg-slate-50',
            disabled && 'opacity-50',
            triggerClassName
          )}
        >
          {Icon ? <Icon size={18} color="#155AA3" /> : null}
          <Text
            numberOfLines={1}
            className={cn('flex-1 text-base', selected ? 'font-sans-semibold text-foreground' : 'text-muted-foreground')}
          >
            {selected?.label ?? placeholder}
          </Text>
          <ChevronDown size={18} color="#66777F" />
        </Pressable>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Overlay style={StyleSheet.absoluteFill}>
          <SelectPrimitive.Content
            position="popper"
            sideOffset={6}
            insets={{ top: insets.top + 8, bottom: insets.bottom + 8, left: 12, right: 12 }}
            style={styles.content}
          >
            <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled">
              {options.map((option) => (
                <SelectItem key={option.value} option={option} selected={option.value === value} />
              ))}
            </ScrollView>
          </SelectPrimitive.Content>
        </SelectPrimitive.Overlay>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}

function SelectItem({ option, selected }: { option: SelectOption; selected: boolean }) {
  return (
    <SelectPrimitive.Item value={option.value} label={option.label} asChild>
      <Pressable
        accessibilityRole="menuitem"
        accessibilityState={{ selected }}
        className={cn('min-h-12 flex-row items-center gap-3 rounded-lg px-3 active:bg-brand-50', selected && 'bg-brand-50')}
      >
        <View className="w-5 items-center">{selected ? <Check size={18} color="#1A6FC9" /> : null}</View>
        <Text className={cn('flex-1 text-base', selected && 'font-sans-semibold text-brand-700')} numberOfLines={2}>
          {option.label}
        </Text>
      </Pressable>
    </SelectPrimitive.Item>
  );
}

/** A labelled field around Select, for forms. */
export function SelectField(props: Parameters<typeof Select>[0] & { hint?: ReactNode }) {
  return (
    <View className="gap-1.5">
      <Text className="font-sans-semibold text-sm text-slate-700">{props.label}</Text>
      <Select {...props} />
      {props.hint ? <Text className="text-sm text-muted-foreground">{props.hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    minWidth: 220,
    maxWidth: 360,
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#DCE7EC',
    padding: 4,
    shadowColor: '#1B3548',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.16,
    shadowRadius: 24,
    elevation: 12,
  },
  scroll: { maxHeight: 360 },
});
