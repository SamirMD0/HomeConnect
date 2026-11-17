import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { Text } from '../components/ui/text';
import { requestCloudSync, syncedLabel, useSyncStatus } from './sync-status';
export function SyncLine() {
  const status = useSyncStatus();
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(timer); }, []);
  return <Pressable accessibilityRole="button" accessibilityLabel="Sync phone data" onPress={() => void requestCloudSync()}>
    <View className="flex-row items-center gap-1.5 px-1 pb-1">
      {status.syncing && <ActivityIndicator size="small" color="#155AA3" />}
      <Text className="flex-1 text-xs text-muted-foreground" accessibilityLiveRegion="polite">{status.syncing ? 'Syncing…' : status.error ? 'Sync delayed. Tap to retry.' : syncedLabel(status.lastSyncAt, now)}</Text>
    </View>
  </Pressable>;
}
