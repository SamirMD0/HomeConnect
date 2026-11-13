import { Stack } from 'expo-router';
import { useSession } from '../../src/session/SessionProvider';
export default function AuthLayout() {
  const { phase } = useSession();
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={phase === 'setup'}>
        <Stack.Screen name="connection" />
      </Stack.Protected>
      <Stack.Protected guard={phase === 'login'}>
        <Stack.Screen name="login" />
      </Stack.Protected>
    </Stack>
  );
}
