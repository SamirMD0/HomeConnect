import { ConnectionSetupScreen } from '../../src/screens/ConnectionSetupScreen';
import { useSession } from '../../src/session/SessionProvider';
import { SafeAreaView } from 'react-native-safe-area-context';
export default function Connection() {
  const session = useSession();
  return (
    <SafeAreaView style={{ flex: 1 }}>
      <ConnectionSetupScreen initialSettings={session.connection} onConnected={session.connect} />
    </SafeAreaView>
  );
}
