import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { CustomersScreen } from '../../../src/lookup/screens/CustomersScreen';
import { ReceivablesCard } from '../../../src/customers/ReceivablesCard';
import { useSession } from '../../../src/session/SessionProvider';
import { QuickGrid, type QuickAction } from '../../../src/ui/Stats';
import { theme } from '../../../src/theme';

/**
 * Customers tab (route folder kept as `sell` so every existing link works):
 * receivables first, a row of sales actions, then the customer list.
 */
export default function Customers() {
  const router = useRouter();
  const session = useSession();
  const tiles: QuickAction[] = [
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
    { label: 'Prepaid', icon: 'time-outline', onPress: () => router.push('/(tabs)/sell/prepaid') },
    {
      label: 'Payment',
      icon: 'wallet-outline',
      tone: 'success',
      onPress: () => router.push('/(tabs)/sell/payment'),
    },
  ];
  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <CustomersScreen
        intro={
          <View style={{ gap: theme.spacing.md }}>
            <ReceivablesCard onPress={() => router.push('/(tabs)/sell/receivables')} />
            <QuickGrid actions={tiles} />
          </View>
        }
      />
    </View>
  );
}
