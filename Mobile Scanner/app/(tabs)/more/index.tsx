import { Alert, ScrollView } from 'react-native';
import { ListRow } from '../../../src/components/ListRow';
import { useSession } from '../../../src/session/SessionProvider';
import { theme } from '../../../src/theme';
import { useRouter } from 'expo-router';
import { AppUpdateRow } from '../../../src/updates/AppUpdateRow';
export default function More() {
  const session = useSession();
  const router = useRouter();
  return (
    <ScrollView contentContainerStyle={{ padding: theme.spacing.lg, paddingBottom: 112 }}>
      {session.can('settings.admin') && <ListRow title="Design preview" icon="color-palette-outline" onPress={() => router.push('/(tabs)/more/design')} />}
      {session.can('reports.read') && <ListRow title="Reports" icon="bar-chart-outline" onPress={() => router.push('/(tabs)/more/reports')} />}
      <ListRow
        title={session.user?.fullName ?? 'Account'}
        icon="person-outline"
        subtitle={`Role: ${session.user?.role ?? ''}`}
      />
      <ListRow
        title="PC connection"
        icon="desktop-outline"
        subtitle={session.connection ? `${session.connection.host}:${session.connection.port}` : ''}
        onPress={() =>
          Alert.alert('Change PC?', 'You will be signed out.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Change PC', onPress: () => void session.changeConnection() },
          ])
        }
      />
      <ListRow
        title="Connection details"
        icon="pulse-outline"
        onPress={() => router.push('/(tabs)/more/connection-log')}
      />
      <ListRow
        title="Switch branch"
        icon="business-outline"
        subtitle={session.branch.selected?.name}
        onPress={() => void session.branch.switchBranch()}
      />
      <ListRow
        title="Sign out"
        icon="log-out-outline"
        onPress={() => void session.signOut()}
      />
      <AppUpdateRow />
    </ScrollView>
  );
}
