import { useLocalSearchParams } from 'expo-router';
import { useSession } from '../../../../../src/session/SessionProvider';
import { SupplierStatementScreen } from '../../../../../src/screens/SupplierStatementScreen';
export default function SupplierStatement() {
  const { id = '' } = useLocalSearchParams<{ id: string }>(),
    session = useSession();
  if (!session.connection || !session.token) return null;
  return (
    <SupplierStatementScreen
      supplierId={id}
      connection={session.connection}
      token={session.token}
      onDone={() => {}}
      onSessionInvalid={() => session.invalidateToken(session.token!)}
    />
  );
}
