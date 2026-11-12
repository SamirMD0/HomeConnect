import { Stack, useRouter } from 'expo-router';
import { EmptyState } from '../../../src/components/EmptyState';
export default function Upcoming() {
  const router = useRouter();
  return (
    <>
      <Stack.Screen options={{ title: 'Sell' }} />
      <EmptyState
        title="Sell"
        message="Selling from the phone is coming in a later update. Use the shop PC to create sales for now."
        action={{ label: 'Scan a product', onPress: () => router.push('/scan') }}
      />
    </>
  );
}
