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
        icon="file-tray-full-outline"
        onPress={() => router.push('/(tabs)/suppliers/inbox')}
      />
      {session.can('supplierBills.capture') && (
        <ListRow
          title="Supplier bill"
          icon="camera-outline"
          onPress={() => router.push('/(tabs)/suppliers/bill')}
        />
      )}
      <ListRow
        title="Pending uploads"
        icon="cloud-upload-outline"
        onPress={() => router.push('/(tabs)/suppliers/pending-bills')}
      />
      {session.can('supplierInvoices.write') && (
        <ListRow
          title="Supplier invoice"
          icon="document-text-outline"
          onPress={() => router.push('/(tabs)/suppliers/invoice')}
        />
      )}
      {session.can('supplierPayments.write') && (
        <ListRow
          title="Supplier payment"
          icon="wallet-outline"
          onPress={() => router.push('/(tabs)/suppliers/payment')}
        />
      )}
    </View>
  );
}
