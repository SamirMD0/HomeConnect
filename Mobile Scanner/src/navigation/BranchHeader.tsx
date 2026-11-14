import { useNetInfo } from '@react-native-community/netinfo';
import { useRouter } from 'expo-router';
import {
  BarChart3,
  Building2,
  LogOut,
  MonitorSmartphone,
  Settings,
  Store,
} from 'lucide-react-native';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBanner } from '../components/StatusBanner';
import { DropdownMenu, type MenuEntry } from '../components/ui/dropdown-menu';
import { GlassPanel } from '../components/ui/glass';
import { Select } from '../components/ui/select';
import { Text } from '../components/ui/text';
import { useSession } from '../session/SessionProvider';
import { ActionBell } from '../ui/ActionBell';

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
}

/**
 * The app bar, frosted glass like the PC sidebar: logo, branch dropdown (it
 * switches straight away), the to-do bell and the account menu with Sign out.
 * `menu={false}` (scanner) keeps only the logo and the branch.
 */
export function BranchHeader({ menu = true }: { menu?: boolean }) {
  const session = useSession();
  const router = useRouter();
  const network = useNetInfo();
  const insets = useSafeAreaInsets();
  const branches = session.branch.branches;
  const name = session.user?.fullName || session.user?.username || 'Account';
  const admin = session.user?.role === 'ADMIN';

  const entries: MenuEntry[] = [
    ...(session.can('reports.read')
      ? [{ label: 'Reports', icon: BarChart3, onPress: () => router.push('/(tabs)/more/reports') } as MenuEntry]
      : []),
    { label: 'Settings', icon: Settings, onPress: () => router.push('/(tabs)/more') },
    {
      label: 'Connection',
      icon: MonitorSmartphone,
      detail: session.connection?.host,
      onPress: () => router.push('/(tabs)/more/connection-log'),
    },
    { kind: 'separator' },
    { label: 'Sign out', icon: LogOut, destructive: true, onPress: () => void session.signOut() },
  ];

  return (
    <GlassPanel style={{ paddingTop: insets.top, borderBottomWidth: 1 }}>
      <View className="h-16 flex-row items-center gap-2 px-3">
        <View accessible accessibilityLabel="Home Connect" className="h-10 w-10 items-center justify-center rounded-xl bg-primary">
          <Store size={22} color="#ffffff" />
        </View>
        <View className="min-w-0 flex-1">
          {branches.length > 1 ? (
            <Select
              label="Branch"
              icon={Building2}
              value={session.branch.selected?.id ?? null}
              options={branches.map((branch) => ({ value: branch.id, label: branch.name }))}
              onChange={(id) => {
                const branch = branches.find((item) => item.id === id);
                if (branch && branch.id !== session.branch.selected?.id) void session.branch.choose(branch);
              }}
              triggerClassName="h-11 border-white/70 bg-white/70"
            />
          ) : (
            <View className="h-11 flex-row items-center gap-2 px-1">
              <Building2 size={18} color="#155AA3" />
              <Text numberOfLines={1} className="flex-1 font-sans-semibold text-base">
                {session.branch.selected?.name ?? ''}
              </Text>
            </View>
          )}
        </View>
        {menu ? <ActionBell /> : null}
        {menu ? (
          <DropdownMenu
            entries={entries}
            header={
              <View className="gap-0.5">
                <Text className="font-sans-bold text-base" numberOfLines={1}>
                  {name}
                </Text>
                <Text className="text-sm text-muted-foreground">{admin ? 'Admin' : 'Staff'}</Text>
              </View>
            }
            trigger={
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Account menu, ${name}`}
                className="h-11 w-11 items-center justify-center rounded-full border border-white/80 bg-brand-50 active:bg-brand-100"
              >
                <Text className="font-sans-bold text-sm text-brand-700">{initials(name)}</Text>
              </Pressable>
            }
          />
        ) : null}
      </View>
      {network.isConnected === false || session.offline ? (
        <View className="px-3 pb-2">
          <StatusBanner tone="warning" message="Offline. Reconnect to the shop Wi-Fi." />
        </View>
      ) : null}
      {session.warning ? (
        <View className="px-3 pb-2">
          <StatusBanner tone="warning" message={session.warning} />
        </View>
      ) : null}
    </GlassPanel>
  );
}
