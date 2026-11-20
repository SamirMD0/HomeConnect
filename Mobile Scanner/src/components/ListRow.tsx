import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Pressable } from '../ui/Pressable';
import Ionicons from '@expo/vector-icons/Ionicons';
import { theme } from '../theme';
import { IconTile } from '../ui/Stats';
import { cloudMode } from '../offline/cloud-mode';
import { CLOUD_WRITE_NOTE } from '../offline/cloud-policy';
export function ListRow({
  title,
  subtitle,
  onPress,
  trailing,
  icon,
  leading,
  cloudWrite = false,
}: {
  title: string;
  subtitle?: string;
  onPress?: () => void;
  trailing?: ReactNode;
  /** Optional leading icon (Ionicons name) for menu rows. */
  icon?: keyof typeof Ionicons.glyphMap;
  /** Any element before the text, e.g. a product photo. */
  leading?: ReactNode;
  cloudWrite?: boolean;
}) {
  const cloudDisabled = cloudMode() && cloudWrite;
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      onPress={onPress}
      disabled={!onPress || cloudDisabled}
      accessibilityState={{ disabled: !onPress || cloudDisabled }}
      accessibilityHint={cloudDisabled ? CLOUD_WRITE_NOTE : undefined}
      style={({ pressed }) => [styles.row, cloudDisabled && { opacity: 0.5 }, pressed && styles.pressed]}
    >
      {leading ?? (icon ? <IconTile icon={icon} size={44} /> : null)}
      <View style={styles.copy}>
        <Text style={styles.title}>{title}</Text>
        {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
        {cloudDisabled && <Text style={styles.subtitle}>{CLOUD_WRITE_NOTE}</Text>}
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
