import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { theme } from '../theme';

/**
 * Stack screen header: back chevron, centred blue title, optional right slot
 * (the bell). Android's system Back still works; this is the visible twin.
 */
export function ScreenHeader({
  title,
  onBack,
  right,
  topInset = true,
}: {
  title: string;
  onBack?: () => void;
  right?: ReactNode;
  /** False under another header that already clears the status bar (tab stacks). */
  topInset?: boolean;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { paddingTop: topInset ? insets.top : 0 }]}>
      <View style={styles.row}>
        <View style={styles.side}>
          {onBack ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back"
              onPress={onBack}
              hitSlop={4}
              style={({ pressed }) => [styles.icon, pressed && styles.pressed]}
            >
              <Ionicons
                name="chevron-back"
                size={26}
                color={theme.colors.text}
                accessible={false}
              />
            </Pressable>
          ) : null}
        </View>
        <Text accessibilityRole="header" numberOfLines={1} style={styles.title}>
          {title}
        </Text>
        <View style={[styles.side, styles.end]}>{right}</View>
      </View>
    </View>
  );
}

/** Large left-aligned page title with an optional grey subtitle. */
export function PageTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={styles.page}>
      <Text accessibilityRole="header" style={styles.pageTitle}>
        {title}
      </Text>
      {subtitle ? <Text style={styles.pageSubtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderColor: theme.colors.border,
  },
  row: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.xs,
  },
  side: { width: 56, flexDirection: 'row', alignItems: 'center' },
  end: { justifyContent: 'flex-end' },
  icon: {
    width: theme.touch,
    height: theme.touch,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius.pill,
  },
  pressed: { backgroundColor: theme.colors.neutralSoft },
  title: { flex: 1, textAlign: 'center', ...theme.text.titleSmall, color: theme.colors.brand },
  page: { gap: 4 },
  pageTitle: { ...theme.text.headline, color: theme.colors.text },
  pageSubtitle: { ...theme.text.body, color: theme.colors.muted },
});
