import { Stack, useRouter } from 'expo-router';
import { EmptyState } from '../../../src/components/EmptyState';
export default function Upcoming() {
  const router = useRouter();
  return (
    <>
      <Stack.Screen options={{ title: 'Stock count' }} />
      <EmptyState
        title="Stock count"
        message="Stock counting is coming in a later update. Use the shop PC for inventory adjustments."
        action={{ label: 'Scan a product', onPress: () => router.push('/scan') }}
      />
    </>
  );
}
