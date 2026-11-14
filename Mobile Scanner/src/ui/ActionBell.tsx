import { useState } from 'react';
import { useRouter, type Href } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { getReceivablesSummary } from '../api/receivables-api';
import { backendBaseUrl } from '../api/hc-client';
import { Sheet } from '../components/Sheet';
import { useLookup } from '../lookup/useLookup';
import { queryKeys } from '../query/keys';
import { receiptQueue } from '../services/receipt-queue';
import { countUnlinkedBills } from '../suppliers/bills-inbox';
import { theme } from '../theme';
import { IconTile } from './Stats';
import type { Tone } from './Badge';

interface Item {
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  tone: Tone;
  title: string;
  count: number;
  href: Href;
}

/**
 * Header bell: one list of things to act on. A red dot shows when any count
 * is above zero. Each source is read with the same rules as its own screen.
 */
export function ActionBell() {
  const router = useRouter();
  const { client, key, session } = useLookup();
  const [open, setOpen] = useState(false);
  const canSuppliers = session.can('suppliers.read');
  const canCustomers = session.can('sell');
  const bills = useQuery({
    queryKey: key('bills-unlinked-count'),
    queryFn: () => countUnlinkedBills(client),
    enabled: canSuppliers,
    refetchInterval: 60_000,
  });
  const overdue = useQuery({
    queryKey: key('receivables-summary'),
    queryFn: () => getReceivablesSummary(client),
    enabled: canCustomers,
  });
  const pending = useQuery({
    queryKey: queryKeys.pendingBills({
      server: session.connection ? backendBaseUrl(session.connection) : '',
      userId: session.user?.id ?? '',
      branchId: session.branch.selected?.id ?? '',
    }),
    queryFn: () => receiptQueue().listPending(),
    refetchInterval: 15_000,
  });
  const items: Item[] = [
    ...(canSuppliers
      ? [
          {
            key: 'bills',
            icon: 'document-attach-outline' as const,
            tone: 'brand' as Tone,
            title: 'Bills to link',
            count: bills.data ?? 0,
            href: '/(tabs)/suppliers/inbox' as Href,
          },
        ]
      : []),
    ...(canCustomers
      ? [
          {
            key: 'overdue',
            icon: 'alert-circle-outline' as const,
            tone: 'danger' as Tone,
            title: 'Overdue customers',
            count: overdue.data?.customersOverdue ?? 0,
            href: '/(tabs)/sell/receivables' as Href,
          },
        ]
      : []),
    {
      key: 'pending',
      icon: 'cloud-upload-outline',
      tone: 'warning',
      title: 'Bill photos not sent yet',
      count: pending.data?.length ?? 0,
      href: '/(tabs)/suppliers/pending-bills',
    },
  ];
  const total = items.reduce((sum, item) => sum + item.count, 0);
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={total ? `To do, ${total} items` : 'To do, nothing waiting'}
        onPress={() => setOpen(true)}
        hitSlop={4}
        style={({ pressed }) => [styles.bell, pressed && styles.pressed]}
      >
        <Ionicons
          name="notifications-outline"
          size={24}
          color={theme.colors.text}
          accessible={false}
        />
        {total ? <View style={styles.dot} /> : null}
      </Pressable>
      <Sheet title="To do" visible={open} onClose={() => setOpen(false)}>
        <View style={styles.list}>
          {items.map((item) => (
            <Pressable
              key={item.key}
              accessibilityRole="button"
              accessibilityLabel={`${item.title}, ${item.count}`}
              onPress={() => {
                setOpen(false);
                router.push(item.href);
              }}
              style={({ pressed }) => [styles.item, pressed && styles.pressed]}
            >
              <IconTile icon={item.icon} tone={item.count ? item.tone : 'neutral'} size={44} />
              <Text style={styles.itemTitle}>{item.title}</Text>
              <Text style={[styles.itemCount, !item.count && styles.zero]}>{item.count}</Text>
              <Ionicons
                name="chevron-forward"
                size={20}
                color={theme.colors.muted}
                accessible={false}
              />
            </Pressable>
          ))}
          {!total ? <Text style={styles.empty}>Nothing waiting.</Text> : null}
        </View>
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  bell: {
    width: theme.touch,
    height: theme.touch,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius.pill,
  },
  pressed: { backgroundColor: theme.colors.neutralSoft },
  dot: {
    position: 'absolute',
    top: 11,
    right: 12,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: theme.colors.danger,
    borderWidth: 2,
    borderColor: theme.colors.surface,
  },
  list: { padding: theme.spacing.sm },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    minHeight: 64,
    paddingHorizontal: theme.spacing.sm,
    borderRadius: theme.radius.md,
  },
  itemTitle: { flex: 1, ...theme.text.bodyStrong, color: theme.colors.text },
  itemCount: { ...theme.text.titleSmall, color: theme.colors.text, fontVariant: ['tabular-nums'] },
  zero: { color: theme.colors.subtle },
  empty: {
    ...theme.text.body,
    color: theme.colors.muted,
    padding: theme.spacing.lg,
    textAlign: 'center',
  },
});
