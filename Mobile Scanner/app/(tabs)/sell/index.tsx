import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { CustomersScreen } from '../../../src/lookup/screens/CustomersScreen';
import { ListRow } from '../../../src/components/ListRow';
import { useSession } from '../../../src/session/SessionProvider';
export default function Sell() {
  const router = useRouter();
  const session = useSession();
  return (
    <View style={{ flex: 1 }}>
      {session.can('orders.create') && (
        <ListRow
          title="New order"
          subtitle="Create or resume the order saved on this phone"
          onPress={() => router.push('/(tabs)/sell/new-order')}
        />
      )}
      <ListRow
        title="Sales orders"
        subtitle="Search orders, payments and delivery status"
        onPress={() => router.push('/(tabs)/sell/orders')}
      />
      <ListRow
        title="Prepaid items"
        subtitle="Items customers paid for in advance"
        onPress={() => router.push('/(tabs)/sell/prepaid')}
      />
      <CustomersScreen />
    </View>
  );
}
