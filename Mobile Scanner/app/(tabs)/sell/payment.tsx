import { Stack, useRouter } from 'expo-router';
import { EmptyState } from '../../../src/components/EmptyState';
export default function Upcoming() {
  const router = useRouter();
  return (
    <>
      <Stack.Screen options={{ title: 'Take payment' }} />
      <EmptyState
        title="Take payment"
        message="Customer payments are coming in a later update. Use the shop PC to record a customer payment."
        action={{ label: 'Scan a product', onPress: () => router.push('/scan') }}
      />
    </>
  );
}
