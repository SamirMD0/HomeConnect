import { ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { ListRow } from '../components/ListRow';
import { useSession } from '../session/SessionProvider';
import { theme } from '../theme';
export function SuppliersHomeScreen() {
  const session = useSession(),
    router = useRouter();
  return (
    <ScrollView contentContainerStyle={{ padding: theme.spacing.lg, paddingBottom: 112 }}>
      {session.can('supplierBills.capture') && (
        <ListRow
          title="Supplier bill"
          subtitle="Capture or choose bill pages"
          onPress={() => router.push('/(tabs)/suppliers/bill')}
        />
      )}
      <ListRow
        title="Pending bills"
        subtitle="Retry or manage saved pages"
        onPress={() => router.push('/(tabs)/suppliers/pending-bills')}
      />
      {session.can('supplierInvoices.write') && (
        <ListRow
          title="Supplier invoice"
          subtitle="Record an invoice and its products"
          onPress={() => router.push('/(tabs)/suppliers/invoice')}
        />
      )}
      {session.can('supplierPayments.write') && (
        <ListRow
          title="Supplier payment"
          subtitle="Record a payment to a supplier"
          onPress={() => router.push('/(tabs)/suppliers/payment')}
        />
      )}
      <ListRow
        title="Supplier statement"
        subtitle="View purchases, payments, and balance"
        onPress={() => router.push('/(tabs)/suppliers/statement')}
      />
    </ScrollView>
  );
}
