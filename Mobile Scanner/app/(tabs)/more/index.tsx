import type { ReactNode } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import appConfig from '../../../app.json';
import { ListRow } from '../../../src/components/ListRow';
import { AppButton } from '../../../src/components/AppButton';
import { useSession } from '../../../src/session/SessionProvider';
import { theme } from '../../../src/theme';
import { AppUpdateRow } from '../../../src/updates/AppUpdateRow';
import { Badge } from '../../../src/ui/Badge';
import { IconTile } from '../../../src/ui/Stats';

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.group}>
      <Text accessibilityRole="header" style={styles.groupTitle}>
        {title}
      </Text>
      {children}
    </View>
  );
}

/** More: account, reports, shop connection and app settings, then Sign out. */
export default function More() {
  const session = useSession();
  const router = useRouter();
  const admin = session.user?.role === 'ADMIN';
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.account}>
        <IconTile icon="person" size={52} />
        <View style={styles.accountCopy}>
          <Text style={styles.name}>
            {session.user?.fullName || session.user?.username || 'Account'}
          </Text>
          <Badge tone={admin ? 'brand' : 'neutral'} label={admin ? 'Admin' : 'Staff'} />
        </View>
      </View>

      {session.can('reports.read') && (
        <Group title="Reports">
          <ListRow
            title="Reports"
            icon="bar-chart-outline"
            onPress={() => router.push('/(tabs)/more/reports')}
          />
        </Group>
      )}

      <Group title="Shop">
        <ListRow
          title="Branch"
          icon="business-outline"
          subtitle={session.branch.selected?.name}
          onPress={() => void session.branch.switchBranch()}
        />
        <ListRow
          title="Shop PC"
          icon="desktop-outline"
          subtitle={
            session.connection ? `${session.connection.host}:${session.connection.port}` : ''
          }
          onPress={() =>
            Alert.alert('Use another PC?', 'You will be signed out.', [
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
      </Group>

      <Group title="App">
        <AppUpdateRow />
        {session.can('settings.admin') && (
          <ListRow
            title="Design preview"
            icon="color-palette-outline"
            onPress={() => router.push('/(tabs)/more/design')}
          />
        )}
      </Group>

      <AppButton
        label="Sign out"
        icon="log-out-outline"
        variant="danger"
        onPress={() => void session.signOut()}
      />
      <Text style={styles.version}>Home Connect · Version {appConfig.expo.version}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: theme.spacing.lg,
    paddingBottom: 112,
    gap: theme.spacing.xl,
    backgroundColor: theme.colors.background,
  },
  account: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md },
  accountCopy: { flex: 1, gap: 6 },
  name: { ...theme.text.title, color: theme.colors.text },
  group: { gap: theme.spacing.sm },
  groupTitle: { ...theme.text.label, color: theme.colors.muted },
  version: { ...theme.text.caption, color: theme.colors.subtle, textAlign: 'center' },
});
