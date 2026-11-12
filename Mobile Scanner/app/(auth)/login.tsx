import { LoginScreen } from '../../src/screens/LoginScreen';
import { useSession } from '../../src/session/SessionProvider';
import { SafeAreaView } from 'react-native-safe-area-context';
export default function Login() {
  const session = useSession();
  if (!session.connection) return null;
  return (
    <SafeAreaView style={{ flex: 1 }}>
      <LoginScreen
        connection={session.connection}
        startupMessage={session.warning}
        onLoggedIn={session.login}
        onChangeConnection={session.changeConnection}
      />
    </SafeAreaView>
  );
}
