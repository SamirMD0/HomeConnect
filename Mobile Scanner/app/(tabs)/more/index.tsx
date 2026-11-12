import { Alert, ScrollView } from 'react-native';
import { ListRow } from '../../../src/components/ListRow';
import { useSession } from '../../../src/session/SessionProvider';
import { theme } from '../../../src/theme';
import { useRouter } from 'expo-router';
export default function More() {
  const session = useSession();
  const router = useRouter();
  return (
    <ScrollView contentContainerStyle={{ padding: theme.spacing.lg, paddingBottom: 112 }}>
      {session.can('reports.read') && <ListRow title="Reports" subtitle="Read-only reports from the shop PC" onPress={() => router.push('/(tabs)/more/reports')} />}
      <ListRow title="Supplier tools" subtitle="Existing bill capture, pending bills and entry tools" onPress={() => router.push('/(tabs)/suppliers/tools')} />
      <ListRow
        title={session.user?.fullName ?? 'Account'}
        subtitle={`Role: ${session.user?.role ?? ''}`}
      />
      <ListRow
        title="PC connection"
        subtitle={session.connection ? `${session.connection.host}:${session.connection.port}` : ''}
        onPress={() =>
          Alert.alert('Change shop PC?', 'You will sign out and return to connection setup.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Change PC', onPress: () => void session.changeConnection() },
          ])
        }
      />
      <ListRow
        title="Switch branch"
        subtitle={session.branch.selected?.name}
        onPress={() => void session.branch.switchBranch()}
      />
      <ListRow
        title="Sign out"
        subtitle="Keep this PC connection for next time"
        onPress={() => void session.signOut()}
      />
      <ListRow title="HomeConnect Mobile" subtitle="Version 1.3.0" />
    </ScrollView>
  );
}
