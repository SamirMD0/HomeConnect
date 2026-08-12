import { ActivityIndicator, Pressable, StyleSheet, Text, ViewStyle } from 'react-native';

interface AppButtonProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: 'primary' | 'secondary' | 'danger';
  style?: ViewStyle;
}

export function AppButton({
  label,
  onPress,
  disabled = false,
  loading = false,
  variant = 'primary',
  style,
}: AppButtonProps) {
  const unavailable = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: unavailable }}
      disabled={unavailable}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        styles[variant],
        unavailable && styles.disabled,
        pressed && !unavailable && styles.pressed,
        style,
      ]}
    >
      {loading && <ActivityIndicator color={variant === 'primary' ? '#ffffff' : '#0f172a'} size="small" />}
      <Text style={[styles.label, variant !== 'primary' && styles.darkLabel]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 48,
    borderRadius: 12,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    borderWidth: 1,
  },
  primary: { backgroundColor: '#047857', borderColor: '#047857' },
  secondary: { backgroundColor: '#ffffff', borderColor: '#cbd5e1' },
  danger: { backgroundColor: '#fff1f2', borderColor: '#fecdd3' },
  label: { color: '#ffffff', fontSize: 16, fontWeight: '700', textAlign: 'center' },
  darkLabel: { color: '#0f172a' },
  disabled: { opacity: 0.55 },
  pressed: { opacity: 0.82 },
});
