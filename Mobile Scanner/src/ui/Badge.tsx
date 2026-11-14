import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, Text, View } from 'react-native';
import { theme } from '../theme';

export type Tone = 'brand' | 'success' | 'danger' | 'warning' | 'neutral';

/** Foreground and tint per tone. Every foreground passes 4.5:1 on its tint. */
export const toneColors: Record<Tone, { fg: string; bg: string; solid: string }> = {
  brand: { fg: theme.colors.brandStrong, bg: theme.colors.brandSoft, solid: theme.colors.brand },
  success: {
    fg: theme.colors.successStrong,
    bg: theme.colors.successSoft,
    solid: theme.colors.success,
  },
  danger: { fg: theme.colors.danger, bg: theme.colors.dangerSoft, solid: theme.colors.danger },
  warning: { fg: theme.colors.warning, bg: theme.colors.warningSoft, solid: theme.colors.warning },
  neutral: { fg: theme.colors.muted, bg: theme.colors.neutralSoft, solid: theme.colors.muted },
};

/** Small status pill. Pair the colour with words; never colour alone. */
export function Badge({
  label,
  tone = 'neutral',
  icon,
}: {
  label: string;
  tone?: Tone;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  const colors = toneColors[tone];
  return (
    <View style={[styles.badge, { backgroundColor: colors.bg }]}>
      {icon ? <Ionicons name={icon} size={12} color={colors.fg} accessible={false} /> : null}
      <Text style={[styles.text, { color: colors.fg }]}>{label}</Text>
    </View>
  );
}

/** Trend chip, e.g. "▲ 15.3%": up is green, down is red. */
export function TrendChip({ value, inverted = false }: { value: number; inverted?: boolean }) {
  const up = value >= 0;
  const good = inverted ? !up : up;
  return (
    <Badge
      tone={good ? 'success' : 'danger'}
      icon={up ? 'trending-up' : 'trending-down'}
      label={`${Math.abs(value).toFixed(1)}%`}
    />
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: theme.radius.pill,
  },
  text: { ...theme.text.caption, fontWeight: '700', fontVariant: ['tabular-nums'] },
});
