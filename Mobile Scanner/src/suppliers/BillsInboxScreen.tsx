import { useState } from 'react';
import { Stack, useRouter } from 'expo-router';
import { Text, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { formatBusinessDate, formatDateTime, formatMoney } from '@shared/money-format';
import { listPurchases } from '../api/supplier-lookup-api';
import { AppButton } from '../components/AppButton';
import { EmptyState } from '../components/EmptyState';
import { ListRow } from '../components/ListRow';
import { Sheet } from '../components/Sheet';
import { StatusBanner } from '../components/StatusBanner';
import { useLookup } from '../lookup/useLookup';
import { ReadScreen, ReadState, readStyles } from '../lookup/ReadUI';
import { queryKeys } from '../query/keys';
import { BillPreview } from './BillPreview';
import { linkablePurchases, linkBill, listUnlinkedBills, type InboxBill } from './bills-inbox';

/**
 * Bills inbox: bill photos taken without a purchase. Link each to a purchase
 * that received stock, or create the purchase from the bill.
 */
export function BillsInboxScreen() {
  const { client, key, scope, session } = useLookup(),
    router = useRouter();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<InboxBill | null>(null),
    [linking, setLinking] = useState(false),
    [saving, setSaving] = useState(''),
    [message, setMessage] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);

  const bills = useQuery({ queryKey: key('bills-inbox'), queryFn: () => listUnlinkedBills(client) });
  const purchases = useQuery({
    queryKey: key('bill-link-purchases', { supplierId: selected?.supplierId }),
    queryFn: async () => (await listPurchases(client, selected!.supplierId, 1)).items,
    enabled: Boolean(selected && linking),
  });

  const close = () => {
    setSelected(null);
    setLinking(false);
  };

  const link = async (receivingId: string) => {
    if (!selected) return;
    setSaving(receivingId);
    try {
      await linkBill(client, selected, receivingId);
      setMessage({ tone: 'success', text: `Bill from ${selected.supplierName} linked to the purchase.` });
      close();
      await queryClient.invalidateQueries({ queryKey: queryKeys.scope(scope) });
    } catch (error) {
      setMessage({ tone: 'danger', text: error instanceof Error ? error.message : 'Could not link the bill.' });
    } finally {
      setSaving('');
    }
  };

  const options = linkablePurchases(purchases.data ?? []);
  return (
    <>
      <Stack.Screen options={{ title: 'Bills inbox' }} />
      <ReadScreen refreshing={bills.isRefetching} onRefresh={() => void bills.refetch()}>
        <Text accessibilityRole="header" style={readStyles.title}>
          Bills inbox
        </Text>
        <Text style={readStyles.subtitle}>
          Bill photos saved without a purchase, for every supplier in this branch.
        </Text>
        {message ? <StatusBanner tone={message.tone} message={message.text} /> : null}
        <ReadState query={bills} />
        {bills.data && bills.data.length === 0 ? (
          <EmptyState title="All bills are linked" message="New bills saved without a purchase will appear here." />
        ) : null}
        {bills.data?.map((bill) => (
          <ListRow
            key={bill.id}
            title={bill.supplierName}
            subtitle={`${formatDateTime(bill.capturedAt)}${bill.note ? ` · ${bill.note}` : ''}`}
            onPress={() => {
              setMessage(null);
              setSelected(bill);
            }}
          />
        ))}
      </ReadScreen>

      <Sheet title={selected ? `Bill · ${selected.supplierName}` : 'Bill'} visible={Boolean(selected)} onClose={close}>
        {selected ? (
          <View style={{ padding: 16, gap: 12 }}>
            <BillPreview bill={selected} compact />
            {selected.note ? <Text style={readStyles.subtitle}>{selected.note}</Text> : null}
            {!linking ? (
              <>
                <AppButton label="Link to a purchase" onPress={() => setLinking(true)} />
                {session.can('supplierInvoices.write') && (
                  <AppButton
                    label="Create purchase from this bill"
                    variant="secondary"
                    onPress={() => {
                      const bill = selected;
                      close();
                      router.push({
                        pathname: '/(tabs)/suppliers/invoice',
                        params: { billId: bill.id, billBranchId: bill.branchId, supplierId: bill.supplierId },
                      });
                    }}
                  />
                )}
              </>
            ) : (
              <>
                <Text style={readStyles.section}>Recent purchases that received stock</Text>
                <ReadState query={purchases} />
                {purchases.data && options.length === 0 ? (
                  <Text style={readStyles.subtitle}>
                    No purchase from this supplier has a receiving document yet. Create the purchase from
                    this bill instead.
                  </Text>
                ) : null}
                {options.map((purchase) => (
                  <ListRow
                    key={purchase.id}
                    title={purchase.receiptNumber ? `Invoice ${purchase.receiptNumber}` : purchase.description}
                    subtitle={`${formatBusinessDate(purchase.transactionDate)} · ${formatMoney(purchase.amount, purchase.currency)}${saving === purchase.supplierReceivingId ? ' · Linking…' : ''}`}
                    onPress={saving ? undefined : () => void link(purchase.supplierReceivingId)}
                  />
                ))}
                <AppButton label="Back" variant="secondary" onPress={() => setLinking(false)} />
              </>
            )}
          </View>
        ) : null}
      </Sheet>
    </>
  );
}
