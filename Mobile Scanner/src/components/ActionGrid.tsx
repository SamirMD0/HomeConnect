import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { theme } from '../theme';
export interface QuickAction {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  badge?: number;
}
export function ActionGrid({ actions }: { actions: QuickAction[] }) {
  return (
    <View style={styles.grid}>
      {actions.map((action) => (
        <Pressable
          key={action.label}
          accessibilityRole="button"
          accessibilityLabel={`${action.label}${action.badge ? `, ${action.badge} pending` : ''}`}
          onPress={action.onPress}
          style={({ pressed }) => [styles.card, pressed && styles.pressed]}
        >
          <View style={styles.icon}>
            <Ionicons name={action.icon} size={24} color={theme.colors.brand} accessible={false} />
          </View>
          <Text style={styles.label}>{action.label}</Text>
          {Boolean(action.badge) && <Text style={styles.badge}>{action.badge}</Text>}
        </Pressable>
      ))}
    </View>
  );
}
const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.md },
  card: {
    flexBasis: '46%',
    flexGrow: 1,
    minHeight: 120,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
  },
  icon: {
    width: 44,
    height: 44,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { fontSize: theme.type.body, fontWeight: '600', color: theme.colors.text },
  pressed: { backgroundColor: theme.colors.brandSoft },
  badge: {
    position: 'absolute',
    top: 12,
    right: 12,
    color: theme.colors.brandStrong,
    backgroundColor: theme.colors.brandSoft,
    paddingHorizontal: 8,
    borderRadius: theme.radius.pill,
    fontWeight: '700',
  },
});
