import { Alert, ScrollView } from 'react-native';
import { ListRow } from '../../../src/components/ListRow';
import { useSession } from '../../../src/session/SessionProvider';
import { theme } from '../../../src/theme';
export default function More() {
  const session = useSession();
  return (
    <ScrollView contentContainerStyle={{ padding: theme.spacing.lg, paddingBottom: 112 }}>
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
      <ListRow title="HomeConnect Mobile" subtitle="Version 1.2.0" />
    </ScrollView>
  );
}
