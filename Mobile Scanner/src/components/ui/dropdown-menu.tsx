import * as DropdownMenuPrimitive from '@rn-primitives/dropdown-menu';
import type { LucideIcon } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { cn } from '../../lib/utils';
import { Text } from './text';

export type MenuEntry =
  | {
      kind?: 'item';
      label: string;
      icon?: LucideIcon;
      onPress: () => void;
      destructive?: boolean;
      /** Short text on the right, e.g. a count or the current value. */
      detail?: string;
    }
  | { kind: 'separator' }
  | { kind: 'label'; label: string };

/**
 * shadcn DropdownMenu on @rn-primitives. `trigger` is any pressable element
 * (passed with asChild); `entries` are the menu rows.
 */
export function DropdownMenu({
  trigger,
  entries,
  align = 'end',
  header,
}: {
  trigger: ReactNode;
  entries: MenuEntry[];
  align?: 'start' | 'center' | 'end';
  /** Optional block at the top of the menu (account name, role). */
  header?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <DropdownMenuPrimitive.Root>
      <DropdownMenuPrimitive.Trigger asChild>{trigger}</DropdownMenuPrimitive.Trigger>
      <DropdownMenuPrimitive.Portal>
        <DropdownMenuPrimitive.Overlay style={StyleSheet.absoluteFill}>
          <DropdownMenuPrimitive.Content
            align={align}
            sideOffset={6}
            insets={{ top: insets.top + 8, bottom: insets.bottom + 8, left: 12, right: 12 }}
            style={styles.content}
          >
            {header ? <View className="px-3 pb-2 pt-1.5">{header}</View> : null}
            {entries.map((entry, index) => {
              if (entry.kind === 'separator') return <View key={`s${index}`} className="my-1 h-px bg-border" />;
              if (entry.kind === 'label')
                return (
                  <Text key={`l${index}`} className="px-3 pb-1 pt-2 font-sans-semibold text-xs uppercase text-muted-foreground">
                    {entry.label}
                  </Text>
                );
              const Icon = entry.icon;
              return (
                <DropdownMenuPrimitive.Item key={entry.label} onPress={entry.onPress} asChild>
                  <Pressable
                    accessibilityRole="menuitem"
                    className="min-h-12 flex-row items-center gap-3 rounded-lg px-3 active:bg-brand-50"
                  >
                    {Icon ? <Icon size={19} color={entry.destructive ? '#D02241' : '#4D595E'} /> : null}
                    <Text className={cn('flex-1 text-base', entry.destructive && 'text-danger')} numberOfLines={1}>
                      {entry.label}
                    </Text>
                    {entry.detail ? (
                      <Text className="text-sm text-muted-foreground" numberOfLines={1}>
                        {entry.detail}
                      </Text>
                    ) : null}
                  </Pressable>
                </DropdownMenuPrimitive.Item>
              );
            })}
          </DropdownMenuPrimitive.Content>
        </DropdownMenuPrimitive.Overlay>
      </DropdownMenuPrimitive.Portal>
    </DropdownMenuPrimitive.Root>
  );
}

const styles = StyleSheet.create({
  content: {
    minWidth: 240,
    maxWidth: 320,
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
});
