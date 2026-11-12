import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSession } from '../session/SessionProvider';
import { backendBaseUrl } from '../api/hc-client';
import { receiptQueue } from '../services/receipt-queue';
import { queryKeys } from '../query/keys';
import { ActionGrid, type QuickAction } from '../components/ActionGrid';
import { ListRow } from '../components/ListRow';
import { theme } from '../theme';
export function HomeScreen() {
  const session = useSession(),
    router = useRouter();
  const pending = useQuery({
    queryKey: queryKeys.pendingBills({
      server: session.connection ? backendBaseUrl(session.connection) : '',
      userId: session.user?.id ?? '',
      branchId: session.branch.selected?.id ?? '',
    }),
    queryFn: () => receiptQueue().listPending(),
    refetchInterval: 3000,
  });
  const actions: QuickAction[] = [
    { label: 'Scan', icon: 'scan-outline', onPress: () => router.push('/scan') },
    { label: 'Sell', icon: 'cart-outline', onPress: () => router.push('/(tabs)/sell') },
    ...(session.can('supplierBills.capture')
      ? [
          {
            label: 'Supplier bill',
            icon: 'receipt-outline' as const,
            onPress: () => router.push('/(tabs)/suppliers/bill'),
          },
        ]
      : []),
    {
      label: 'Take payment',
      icon: 'wallet-outline',
      onPress: () => router.push('/(tabs)/sell/payment'),
    },
    {
      label: 'Stock count',
      icon: 'clipboard-outline',
      onPress: () => router.push('/(tabs)/stock/count'),
    },
  ];
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.greeting}>
        <Text style={styles.eyebrow}>YOUR SHOP, CONNECTED</Text>
        <Text style={styles.title}>Hello, {session.user?.fullName || session.user?.username}</Text>
        <Text style={styles.subtitle}>{session.branch.selected?.name}</Text>
      </View>
      <Text style={styles.section}>Quick actions</Text>
      <ActionGrid actions={actions} />
      <View style={styles.pending}>
        <ListRow
          title="Pending bills"
          subtitle={
            pending.isError
              ? 'Could not read pending bills. Open to retry.'
              : `${pending.data?.length ?? 0} page(s) saved on this phone`
          }
          onPress={() => router.push('/(tabs)/suppliers/pending-bills')}
          trailing={<Text style={styles.count}>{pending.data?.length ?? 0}</Text>}
        />
      </View>
    </ScrollView>
  );
}
const styles = StyleSheet.create({
  content: { padding: theme.spacing.lg, paddingBottom: 112, gap: theme.spacing.lg },
  greeting: { gap: 6, paddingVertical: 8 },
  eyebrow: { fontSize: 11, letterSpacing: 1.5, fontWeight: '700', color: theme.colors.brandStrong },
  title: { fontSize: theme.type.heading, fontWeight: '800', color: theme.colors.text },
  subtitle: { fontSize: theme.type.body, color: theme.colors.muted },
  section: { fontSize: theme.type.title, fontWeight: '700', color: theme.colors.text },
  pending: {
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: 'hidden',
  },
  count: { fontSize: 18, fontWeight: '700', color: theme.colors.brand },
});
