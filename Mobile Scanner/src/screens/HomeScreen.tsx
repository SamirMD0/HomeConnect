import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RefreshControl, ScrollView, StyleSheet } from 'react-native';
import { useSession } from '../session/SessionProvider';
import { backendBaseUrl } from '../api/hc-client';
import { receiptQueue } from '../services/receipt-queue';
import { queryKeys } from '../query/keys';
import { PageTitle } from '../ui/ScreenHeader';
import { QuickGrid, type QuickAction } from '../ui/Stats';
import { theme } from '../theme';
import { DashboardPanel } from '../lookup/DashboardPanel';
export function HomeScreen() {
  const session = useSession(),
    router = useRouter();
  const [refreshRevision, setRefreshRevision] = useState(0);
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
    // Scan is the centre tab button, so it has no tile here.
    ...(session.can('orders.create')
      ? [
          {
            label: 'New order',
            icon: 'cart-outline' as const,
            onPress: () => router.push('/(tabs)/sell/new-order'),
          },
        ]
      : []),
    { label: 'Orders', icon: 'receipt-outline', onPress: () => router.push('/(tabs)/sell/orders') },
    ...(session.can('supplierPayments.write')
      ? [
          {
            label: 'Pay supplier',
            icon: 'card-outline' as const,
            onPress: () => router.push('/(tabs)/suppliers/payment'),
          },
        ]
      : []),
    {
      label: 'Price check',
      icon: 'pricetag-outline',
      onPress: () => router.push('/(tabs)/stock/price-check'),
    },
    ...(session.can('supplierBills.capture')
      ? [
          {
            label: 'Bill photo',
            icon: 'camera-outline' as const,
            onPress: () => router.push('/(tabs)/suppliers/bill'),
          },
        ]
      : []),
    {
      label: 'Payment',
      icon: 'wallet-outline',
      onPress: () => router.push('/(tabs)/sell/payment'),
    },
    // Counting corrects stock totals (admin-only on the PC); employees get receiving.
    session.user?.role === 'ADMIN'
      ? {
          label: 'Count',
          icon: 'clipboard-outline',
          onPress: () => router.push('/(tabs)/stock/count'),
        }
      : {
          label: 'Receive',
          icon: 'cube-outline',
          onPress: () => router.push('/(tabs)/stock/receive'),
        },
  ];
  const pendingCount = pending.data?.length ?? 0;
  const grid: QuickAction[] = actions.map((action) => ({ ...action }));
  if (session.can('supplierBills.capture'))
    grid.push({
      label: 'Unsent photos',
      icon: 'cloud-upload-outline',
      tone: pendingCount ? 'warning' : 'neutral',
      badge: pendingCount,
      onPress: () => router.push('/(tabs)/suppliers/pending-bills'),
    });
  const name = session.user?.fullName || session.user?.username || '';
  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={pending.isRefetching}
          tintColor={theme.colors.brand}
          onRefresh={() => {
            setRefreshRevision((value) => value + 1);
            void pending.refetch();
          }}
        />
      }
    >
      <PageTitle title={`Hello, ${name.split(' ')[0]}`} subtitle={session.branch.selected?.name} />
      <QuickGrid actions={grid} />
      <DashboardPanel refreshRevision={refreshRevision} />
    </ScrollView>
  );
}
const styles = StyleSheet.create({
  content: {
    padding: theme.spacing.lg,
    paddingBottom: 112,
    gap: theme.spacing.lg,
    backgroundColor: theme.colors.background,
  },
});
