import Ionicons from '@expo/vector-icons/Ionicons';
import { ActivityIndicator, Pressable, StyleSheet, Text, type ViewStyle } from 'react-native';
import { theme } from '../theme';

/**
 * - primary: the one filled action on a screen (brand blue).
 * - success: money in or done (green fill), e.g. Save & print.
 * - danger: destructive. Filled red only inside an action bar (`solid`), soft otherwise.
 * - tonal: an important secondary action (light blue fill).
 * - secondary: outlined neutral.
 * - ghost: text-only, for low-weight actions like "Keep it".
 */
export type ButtonVariant = 'primary' | 'success' | 'danger' | 'tonal' | 'secondary' | 'ghost';

interface AppButtonProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: ButtonVariant;
  /** Filled red for danger (action bars); default is the soft danger style. */
  solid?: boolean;
  style?: ViewStyle;
  icon?: keyof typeof Ionicons.glyphMap;
  /** Square icon-only button; `label` becomes the accessible name. */
  iconOnly?: boolean;
}

const filled = new Set<ButtonVariant>(['primary', 'success']);

export function AppButton({
  label,
  onPress,
  disabled = false,
  loading = false,
  variant = 'primary',
  solid = false,
  style,
  icon,
  iconOnly = false,
}: AppButtonProps) {
  const unavailable = disabled || loading;
  const onFill = filled.has(variant) || (variant === 'danger' && solid);
  const ink = onFill
    ? theme.colors.onBrand
    : variant === 'danger'
      ? theme.colors.danger
      : variant === 'tonal' || variant === 'ghost'
        ? theme.colors.brandStrong
        : theme.colors.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: unavailable, busy: loading }}
      disabled={unavailable}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        styles[variant],
        variant === 'danger' && solid && styles.dangerSolid,
        iconOnly && styles.iconOnly,
        unavailable && styles.disabled,
        pressed && !unavailable && (onFill ? styles.pressedFill : styles.pressed),
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={ink} size="small" />
      ) : icon ? (
        <Ionicons name={icon} size={iconOnly ? 22 : 20} color={ink} accessible={false} />
      ) : null}
      {iconOnly ? null : <Text style={[styles.label, { color: ink }]}>{label}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 52,
    minWidth: theme.touch,
    borderRadius: theme.radius.sm,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  primary: { backgroundColor: theme.colors.brand },
  success: { backgroundColor: theme.colors.success },
  danger: { backgroundColor: theme.colors.dangerSoft, borderColor: theme.colors.dangerBorder },
  dangerSolid: { backgroundColor: theme.colors.danger, borderColor: theme.colors.danger },
  tonal: { backgroundColor: theme.colors.brandSoft },
  secondary: { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
  ghost: { backgroundColor: 'transparent' },
  iconOnly: { width: 52, paddingHorizontal: 0 },
  label: { ...theme.text.bodyStrong, textAlign: 'center' },
  disabled: { opacity: 0.5 },
  pressed: { backgroundColor: theme.colors.neutralSoft },
  pressedFill: { opacity: 0.85 },
});
