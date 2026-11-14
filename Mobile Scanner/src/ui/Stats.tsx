import type { ReactNode } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { theme } from '../theme';
import { toneColors, type Tone } from './Badge';

/**
 * Blue hero card: the one number a screen is about (Total owed, Today's
 * sales). One per screen. `trend` sits in a white pill on the right.
 */
export function HeroCard({
  label,
  value,
  caption,
  trend,
  onPress,
  accessibilityLabel,
}: {
  label: string;
  value: string;
  caption?: string;
  trend?: ReactNode;
  onPress?: () => void;
  accessibilityLabel?: string;
}) {
  const body = (
    <>
      <View style={styles.heroCopy}>
        <Text style={styles.heroLabel}>{label}</Text>
        <Text style={styles.heroValue} numberOfLines={1} adjustsFontSizeToFit>
          {value}
        </Text>
        {caption ? <Text style={styles.heroCaption}>{caption}</Text> : null}
      </View>
      <View style={styles.heroEnd}>
        {trend ? <View style={styles.heroTrend}>{trend}</View> : null}
        {onPress ? <Ionicons name="chevron-forward" size={22} color={theme.colors.onBrand} accessible={false} /> : null}
      </View>
    </>
  );
  return onPress ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? `${label}, ${value}${caption ? `. ${caption}` : ''}`}
      onPress={onPress}
      style={({ pressed }) => [styles.hero, pressed && styles.heroPressed]}
    >
      {body}
    </Pressable>
  ) : (
    <View accessible accessibilityLabel={accessibilityLabel ?? `${label}, ${value}`} style={styles.hero}>
      {body}
    </View>
  );
}

/** Rounded square with a tinted ground and a line icon. */
export function IconTile({ icon, tone = 'brand', size = 48 }: { icon: keyof typeof Ionicons.glyphMap; tone?: Tone; size?: number }) {
  const colors = toneColors[tone];
  return (
    <View style={[styles.tile, { width: size, height: size, backgroundColor: colors.bg }]}>
      <Ionicons name={icon} size={Math.round(size * 0.5)} color={colors.fg} accessible={false} />
    </View>
  );
}

/**
 * One figure in a list: tile, title, small detail, amount on the right with
 * an optional chip under it (Opening cash · Today · $95,499 · ▲15.3%).
 */
export function StatRow({
  icon,
  tone = 'brand',
  title,
  detail,
  value,
  chip,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  tone?: Tone;
  title: string;
  detail?: string;
  value: string;
  chip?: ReactNode;
  onPress?: () => void;
}) {
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`${title}${detail ? `, ${detail}` : ''}, ${value}`}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <IconTile icon={icon} tone={tone} />
      <View style={styles.rowCopy}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {title}
        </Text>
        {detail ? <Text style={styles.rowDetail}>{detail}</Text> : null}
      </View>
      <View style={styles.rowEnd}>
        <Text style={styles.rowValue}>{value}</Text>
        {chip}
      </View>
    </Pressable>
  );
}

export interface QuickAction {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  tone?: Tone;
  /** Count shown on the tile, e.g. pending bills. */
  badge?: number;
}

/** Four-column grid of icon tiles with short labels. */
export function QuickGrid({ actions, columns = 4 }: { actions: QuickAction[]; columns?: number }) {
  return (
    <View style={styles.grid}>
      {actions.map((action) => (
        <Pressable
          key={action.label}
          accessibilityRole="button"
          accessibilityLabel={`${action.label}${action.badge ? `, ${action.badge} waiting` : ''}`}
          onPress={action.onPress}
          style={({ pressed }) => [styles.cell, { width: `${100 / columns}%` }, pressed && styles.cellPressed]}
        >
          <View>
            <IconTile icon={action.icon} tone={action.tone} size={52} />
            {action.badge ? (
              <View style={styles.count}>
                <Text style={styles.countText}>{action.badge > 99 ? '99+' : action.badge}</Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.cellLabel} numberOfLines={2}>
            {action.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    padding: theme.spacing.lg + 4,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.brand,
    ...theme.elevation.card,
  },
  heroPressed: { backgroundColor: theme.colors.brandStrong },
  heroCopy: { flex: 1, gap: 2 },
  heroLabel: { ...theme.text.label, color: theme.colors.onBrand },
  heroValue: { ...theme.text.display, color: theme.colors.onBrand, fontVariant: ['tabular-nums'] },
  heroCaption: { ...theme.text.label, fontWeight: '400', color: theme.colors.onBrand },
  heroEnd: { alignItems: 'flex-end', gap: theme.spacing.sm },
  heroTrend: { backgroundColor: theme.colors.surface, borderRadius: theme.radius.pill, padding: 2 },
  tile: { borderRadius: theme.radius.md, alignItems: 'center', justifyContent: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    minHeight: 72,
    padding: theme.spacing.md,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceMuted,
  },
  rowPressed: { backgroundColor: theme.colors.brandSoft },
  rowCopy: { flex: 1, gap: 2 },
  rowTitle: { ...theme.text.bodyStrong, color: theme.colors.text },
  rowDetail: { ...theme.text.caption, color: theme.colors.muted },
  rowEnd: { alignItems: 'flex-end', gap: 4 },
  rowValue: { ...theme.text.bodyStrong, fontWeight: '700', color: theme.colors.text, fontVariant: ['tabular-nums'] },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 },
  cell: { alignItems: 'center', gap: 6, paddingVertical: theme.spacing.sm, paddingHorizontal: 4, borderRadius: theme.radius.md },
  cellPressed: { backgroundColor: theme.colors.brandSoft },
  cellLabel: { ...theme.text.caption, color: theme.colors.text, textAlign: 'center' },
  count: {
    position: 'absolute',
    top: -4,
    right: -6,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.danger,
    borderWidth: 2,
    borderColor: theme.colors.surface,
  },
  countText: { fontSize: 11, fontWeight: '800', color: theme.colors.white },
});
