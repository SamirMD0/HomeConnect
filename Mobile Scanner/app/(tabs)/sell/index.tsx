import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { CustomersScreen } from '../../../src/lookup/screens/CustomersScreen';
import { ListRow } from '../../../src/components/ListRow';
export default function Sell() {
  const router = useRouter();
  return <View style={{ flex: 1 }}><ListRow title="Sales orders" subtitle="Search orders, payments and delivery status" onPress={() => router.push('/(tabs)/sell/orders')} /><CustomersScreen /></View>;
}
