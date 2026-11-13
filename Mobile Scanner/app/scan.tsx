import { useRouter } from 'expo-router';
import { randomUUID } from 'expo-crypto';
import { ScannerScreen } from '../src/screens/ScannerScreen';
import { useSession } from '../src/session/SessionProvider';
export default function Scan() {
  const session = useSession(),
    router = useRouter();
  if (!session.connection || !session.token) return null;
  return (
    <ScannerScreen
      connection={session.connection}
      token={session.token}
      userDisplayName={session.user?.fullName ?? ''}
      startupMessage={null}
      onSessionInvalid={() => session.invalidateToken(session.token!)}
      onDone={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/home'))}
      onProductDetail={(id) =>
        router.replace({ pathname: '/(tabs)/stock/product/[id]', params: { id } })
      }
      onAddToOrder={
        session.can('orders.create')
          ? (id) =>
              router.replace({
                pathname: '/(tabs)/sell/new-order',
                params: { productId: id, scanKey: randomUUID() },
              })
          : undefined
      }
    />
  );
}
