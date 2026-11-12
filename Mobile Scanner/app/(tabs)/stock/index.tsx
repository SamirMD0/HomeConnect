import { Stack, useRouter } from 'expo-router';
import { EmptyState } from '../../../src/components/EmptyState';
export default function Upcoming() {
  const router = useRouter();
  return (
    <>
      <Stack.Screen options={{ title: 'Stock' }} />
      <EmptyState
        title="Stock"
        message="Stock browsing is coming in a later update. Product scanning is available now."
        action={{ label: 'Scan a product', onPress: () => router.push('/scan') }}
      />
    </>
  );
}
