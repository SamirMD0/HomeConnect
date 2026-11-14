import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNetInfo } from '@react-native-community/netinfo';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSession } from '../session/SessionProvider';
import { AppButton } from '../components/AppButton';
import { Sheet } from '../components/Sheet';
import { StatusBanner } from '../components/StatusBanner';
import { theme } from '../theme';
import { ActionBell } from '../ui/ActionBell';
export function BranchHeader({ menu = true }: { menu?: boolean }) {
  const session = useSession();
  const router = useRouter();
  const [switching, setSwitching] = useState(false);
  const network = useNetInfo();
  return (
    <SafeAreaView edges={['top']} style={styles.header}>
      <View style={styles.row}>
        <Text style={styles.brand}>HOME CONNECT</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Switch branch, current branch ${session.branch.selected?.name}`}
          onPress={() => setSwitching(true)}
          style={({ pressed }) => [styles.branch, pressed && { opacity: 0.7 }]}
        >
          <Ionicons
            name="business-outline"
            color={theme.colors.brand}
            size={18}
            accessible={false}
          />
          <Text style={styles.branchName}>{session.branch.selected?.name}</Text>
          <Ionicons name="chevron-down" color={theme.colors.brand} size={16} accessible={false} />
        </Pressable>
        {menu && <ActionBell />}
        {menu && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="More: reports and settings"
            onPress={() => router.push('/(tabs)/more')}
            hitSlop={4}
            style={({ pressed }) => [styles.menu, pressed && { opacity: 0.7 }]}
          >
            <Ionicons
              name="grid-outline"
              color={theme.colors.brandStrong}
              size={22}
              accessible={false}
            />
          </Pressable>
        )}
      </View>
      {(network.isConnected === false || session.offline) && (
        <StatusBanner tone="warning" message="Connection lost. Reconnect to shop Wi-Fi to sync." />
      )}
      {session.warning && <StatusBanner tone="warning" message={session.warning} />}
      <Sheet title="Switch branch" visible={switching} onClose={() => setSwitching(false)}>
        <View style={styles.sheet}>
          <Text style={styles.copy}>Open forms will close when you switch branch.</Text>
          <AppButton
            label="Choose another branch"
            onPress={() => {
              setSwitching(false);
              void session.branch.switchBranch();
            }}
          />
        </View>
      </Sheet>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  header: {
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.sm,
    gap: theme.spacing.sm,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  brand: {
    flex: 1,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    color: theme.colors.brandStrong,
  },
  branch: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
    padding: 8,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.brandSoft,
  },
  menu: {
    width: 48,
    height: 48,
    borderRadius: theme.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.neutralSoft,
  },
  branchName: { fontSize: 14, fontWeight: '600', color: theme.colors.brandStrong, flexShrink: 1 },
  sheet: { padding: theme.spacing.lg, gap: theme.spacing.lg },
  copy: { color: theme.colors.muted, fontSize: 16 },
});
