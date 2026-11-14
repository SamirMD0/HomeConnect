import { Stack } from 'expo-router';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { SessionProvider, useSession } from '../src/session/SessionProvider';
import { QueryProvider } from '../src/query/QueryProvider';
import { ErrorState } from '../src/components/ErrorState';
import { AppButton } from '../src/components/AppButton';
import { theme } from '../src/theme';
import { BranchHeader } from '../src/navigation/BranchHeader';
import { UpdateBanner } from '../src/updates/UpdateBanner';
import { ConnectionLogPanel } from '../src/connection/ConnectionLogPanel';
import { useState } from 'react';
function Navigation() {
  const session = useSession();
  const [detailsOpen, setDetailsOpen] = useState(false);
  if (session.phase === 'restoring')
    return (
      <SafeAreaView
        style={{
          flex: 1,
          justifyContent: 'center',
          gap: 16,
          backgroundColor: theme.colors.background,
        }}
      >
        <ActivityIndicator color={theme.colors.brand} />
        <Text style={{ textAlign: 'center', color: theme.colors.muted }}>
          Connecting to your shop…
        </Text>
      </SafeAreaView>
    );
  if (session.phase === 'error')
    return (
      <SafeAreaView
        style={{ flex: 1, justifyContent: 'center', backgroundColor: theme.colors.background }}
      >
        <ErrorState
          message={session.error ?? 'Could not connect to the PC.'}
          onRetry={session.retry}
        />
        <View style={{ padding: 16, gap: 12 }}>
          <AppButton
            label="Change PC connection"
            variant="secondary"
            onPress={() => void session.changeConnection()}
          />
          <AppButton
            label={detailsOpen ? 'Hide details' : 'Connection details'}
            icon="pulse-outline"
            variant="secondary"
            onPress={() => setDetailsOpen((value) => !value)}
          />
        </View>
        {detailsOpen && (
          <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}>
            <ConnectionLogPanel limit={12} />
          </ScrollView>
        )}
      </SafeAreaView>
    );
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Protected guard={session.phase === 'setup' || session.phase === 'login'}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
      <Stack.Protected guard={session.phase === 'branch'}>
        <Stack.Screen name="branches" />
      </Stack.Protected>
      <Stack.Protected guard={session.phase === 'update'}>
        <Stack.Screen name="update-required" />
      </Stack.Protected>
      <Stack.Protected guard={session.phase === 'ready'}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="scan"
          options={{
            presentation: 'modal',
            headerShown: true,
            header: () => <BranchHeader menu={false} />,
            title: 'Scan product',
            headerTintColor: theme.colors.brand,
          }}
        />
      </Stack.Protected>
    </Stack>
  );
}
export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <QueryProvider>
        <SessionProvider>
          <Navigation />
          <UpdateBanner />
          <StatusBar style="dark" />
        </SessionProvider>
      </QueryProvider>
    </SafeAreaProvider>
  );
}
