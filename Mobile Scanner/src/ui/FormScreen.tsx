import type { PropsWithChildren, ReactNode } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScrollView, KeyboardStickyView } from 'react-native-keyboard-controller';
import { theme } from '../theme';

/**
 * Every form screen uses this. The focused field scrolls above the keyboard,
 * and `footer` (an ActionBar) rides on top of the keyboard instead of hiding
 * under it. Needs KeyboardProvider at the root (app/_layout.tsx).
 */
export function FormScreen({
  children,
  footer,
  contentStyle,
}: PropsWithChildren<{ footer?: ReactNode; contentStyle?: ViewStyle }>) {
  return (
    <View style={styles.screen}>
      <KeyboardAwareScrollView
        bottomOffset={footer ? 96 : 24}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.content, footer ? styles.withFooter : null, contentStyle]}
      >
        {children}
      </KeyboardAwareScrollView>
      {footer ? <KeyboardStickyView>{footer}</KeyboardStickyView> : null}
    </View>
  );
}

/**
 * Sticky bottom bar for a screen's actions: icon-only reset or secondary
 * actions on the sides, the main action wide in the middle.
 */
export function ActionBar({ children }: PropsWithChildren) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, theme.spacing.md) }]}>
      {children}
    </View>
  );
}
/** Wrap the wide button in an ActionBar so it takes the remaining width. */
export function ActionBarMain({ children }: PropsWithChildren) {
  return <View style={styles.main}>{children}</View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: theme.spacing.lg, gap: theme.spacing.lg, flexGrow: 1 },
  withFooter: { paddingBottom: theme.spacing.xl },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    borderTopWidth: 1,
    borderColor: theme.colors.border,
    ...theme.elevation.raised,
  },
  main: { flex: 1 },
});
