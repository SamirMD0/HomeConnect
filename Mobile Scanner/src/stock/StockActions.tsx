import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { ListRow } from '../components/ListRow';
import { useSession } from '../session/SessionProvider';

/** Stock tab shortcuts. Counting corrects totals, which the PC allows administrators only. */
export function StockActions() {
  const session = useSession(),
    router = useRouter();
  return (
    <View style={{ gap: 8 }}>
      <ListRow
        title="Price check"
        subtitle="Scan to see price and shared stock"
        onPress={() => router.push('/(tabs)/stock/price-check')}
      />
      <ListRow
        title="Receive goods"
        subtitle="Scan delivered items into stock"
        onPress={() => router.push('/(tabs)/stock/receive')}
      />
      {session.user?.role === 'ADMIN' && (
        <ListRow
          title="Stock count"
          subtitle="Count shelves and correct stock totals"
          onPress={() => router.push('/(tabs)/stock/count')}
        />
      )}
    </View>
  );
}
