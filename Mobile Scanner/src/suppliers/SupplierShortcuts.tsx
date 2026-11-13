import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { ListRow } from '../components/ListRow';
import { useLookup } from '../lookup/useLookup';
import { countUnlinkedBills } from './bills-inbox';

/** Top of the Suppliers tab: the bills inbox (with its count) and the supplier entry tools. */
export function SupplierShortcuts() {
  const { client, key, session } = useLookup(),
    router = useRouter();
  const unlinked = useQuery({
    queryKey: key('bills-inbox-count'),
    queryFn: () => countUnlinkedBills(client),
    enabled: session.can('suppliers.read'),
  });
  const count = unlinked.data ?? 0;
  return (
    <View style={{ gap: 8 }}>
      <ListRow
        title={count ? `Bills inbox · ${count} waiting` : 'Bills inbox'}
        subtitle="Bill photos saved without a purchase"
        onPress={() => router.push('/(tabs)/suppliers/inbox')}
      />
      {session.can('supplierBills.capture') && (
        <ListRow
          title="Supplier bill"
          subtitle="Photograph bill pages"
          onPress={() => router.push('/(tabs)/suppliers/bill')}
        />
      )}
      <ListRow
        title="Pending uploads"
        subtitle="Bill photos still on this phone"
        onPress={() => router.push('/(tabs)/suppliers/pending-bills')}
      />
      {session.can('supplierInvoices.write') && (
        <ListRow
          title="Supplier invoice"
          subtitle="Record a purchase and its products"
          onPress={() => router.push('/(tabs)/suppliers/invoice')}
        />
      )}
      {session.can('supplierPayments.write') && (
        <ListRow
          title="Supplier payment"
          subtitle="Record money paid to a supplier"
          onPress={() => router.push('/(tabs)/suppliers/payment')}
        />
      )}
    </View>
  );
}
