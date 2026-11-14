import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { theme } from '../theme';
import { IconTile } from '../ui/Stats';
export function ListRow({
  title,
  subtitle,
  onPress,
  trailing,
  icon,
}: {
  title: string;
  subtitle?: string;
  onPress?: () => void;
  trailing?: ReactNode;
  /** Optional leading icon (Ionicons name) for menu rows. */
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      {icon ? <IconTile icon={icon} size={44} /> : null}
      <View style={styles.copy}>
        <Text style={styles.title}>{title}</Text>
        {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      </View>
      {trailing}
      {onPress && (
        <Ionicons name="chevron-forward" size={20} color={theme.colors.muted} accessible={false} />
      )}
    </Pressable>
  );
}
const styles = StyleSheet.create({
  // Rounded row on the quiet ground; lists put 8 dp between rows.
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    minHeight: 64,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceMuted,
  },
  copy: { flex: 1, gap: 2 },
  title: { ...theme.text.bodyStrong, color: theme.colors.text },
  subtitle: { ...theme.text.label, fontWeight: '400', color: theme.colors.muted },
  pressed: { backgroundColor: theme.colors.brandSoft },
});
