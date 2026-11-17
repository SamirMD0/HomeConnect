import { useSession } from '../../../src/session/SessionProvider';
import { CustomersScreen } from '../../../src/lookup/screens/CustomersScreen';
import { Stack, useRouter } from 'expo-router';
import { EmptyState } from '../../../src/components/EmptyState';
export default function Upcoming() {
  const router = useRouter();
  const session = useSession();
  if (session.mode === 'cloud')
    return (
      <>
        <Stack.Screen options={{ title: 'Choose customer to pay' }} />
        <CustomersScreen
          onSelect={(id) => router.push({ pathname: '/(tabs)/sell/collect/[id]', params: { id } })}
        />
      </>
    );
  return (
    <>
      <>
        <Stack.Screen options={{ title: 'Take payment' }} />
        <EmptyState
          title="Take payment"
          message="Customer payments are coming in a later update. Use the shop PC to record a customer payment."
          action={{ label: 'Scan a product', onPress: () => router.push('/scan') }}
        />
      </>
    </>
  );
}
