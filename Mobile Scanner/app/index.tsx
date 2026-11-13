import { Redirect } from 'expo-router';
import { useSession } from '../src/session/SessionProvider';
export default function Index() {
  const { phase } = useSession();
  if (phase === 'ready') return <Redirect href="/(tabs)/home" />;
  if (phase === 'branch') return <Redirect href="/branches" />;
  if (phase === 'update') return <Redirect href="/update-required" />;
  return <Redirect href={phase === 'setup' ? '/(auth)/connection' : '/(auth)/login'} />;
}
