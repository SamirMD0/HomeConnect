import { useQuery } from '@tanstack/react-query';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { formatMoney } from '@shared/money-format';
import { getReceivablesSummary } from '../api/receivables-api';
import { useLookup } from '../lookup/useLookup';
import { hiddenDashboardValue } from '../lookup/dashboard-privacy';
import { theme } from '../theme';

/**
 * "Receivables: $X owed, Y overdue". Opens the Receivables screen. `hidden`
 * follows the Home dashboard's hide-numbers switch.
 */
export function ReceivablesCard({ onPress, hidden = false }: { onPress: () => void; hidden?: boolean }) {
  const { client, key, session } = useLookup();
  const summary = useQuery({
    queryKey: key('receivables-summary'),
    queryFn: () => getReceivablesSummary(client),
    enabled: session.can('sell'),
  });
  if (!session.can('sell')) return null;
  const data = summary.data;
  const owed = data ? (hidden ? hiddenDashboardValue : formatMoney(data.totalOutstanding)) : '';
  const detail = summary.isError
    ? 'Could not load. Tap to open.'
    : !data
      ? 'Loading…'
      : `${data.customersWithBalance} owe · ${hidden ? hiddenDashboardValue : formatMoney(data.totalOverdue)} overdue (${data.customersOverdue})`;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={data ? `Receivables, ${owed} owed. ${detail}` : 'Receivables'}
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}
    >
      <View style={styles.copy}>
        <Text style={styles.label}>Receivables</Text>
        <Text style={styles.value}>{data ? `${owed} owed` : '—'}</Text>
        <Text style={styles.detail}>{detail}</Text>
      </View>
      <Ionicons name="chevron-forward" size={22} color={theme.colors.white} accessible={false} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    padding: theme.spacing.lg,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.brand,
  },
  copy: { flex: 1, gap: 2 },
  label: { fontSize: theme.type.small, fontWeight: '700', color: theme.colors.white, opacity: 0.9 },
  value: { fontSize: theme.type.title, fontWeight: '800', color: theme.colors.white, fontVariant: ['tabular-nums'] },
  detail: { fontSize: theme.type.small, color: theme.colors.white, opacity: 0.9 },
});
