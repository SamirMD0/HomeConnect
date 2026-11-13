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
        icon="pricetag-outline"
        onPress={() => router.push('/(tabs)/stock/price-check')}
      />
      <ListRow
        title="Receive goods"
        icon="cube-outline"
        onPress={() => router.push('/(tabs)/stock/receive')}
      />
      {session.user?.role === 'ADMIN' && (
        <ListRow
          title="Stock count"
          icon="clipboard-outline"
          onPress={() => router.push('/(tabs)/stock/count')}
        />
      )}
    </View>
  );
}
