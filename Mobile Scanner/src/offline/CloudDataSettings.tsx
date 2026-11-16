import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Text } from '../components/ui/text';
import { Button } from '../components/ui/button';
import { openLocalDb } from './expo-db';
import { localDbSize } from './record-store';
import { currentSyncEngine, requestCloudSync, syncedLabel, useSyncStatus } from './sync-status';
export function CloudDataSettings() {
  const status = useSyncStatus();
  const [bytes, setBytes] = useState<number | null>(null), [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    void openLocalDb().then(localDbSize).then(value => { if (active) { setBytes(value); setError(''); } })
      .catch(() => { if (active) setError('Could not open phone data. Restart the app and try again.'); });
    return () => { active = false; };
  }, [status.lastSyncAt, status.syncing]);
  return <View className="gap-3 rounded-xl border border-border bg-white p-4">
    <Text className="font-sans-semibold text-base">Phone data</Text>
    <Text className="text-sm text-muted-foreground">{bytes === null ? 'Measuring phone data…' : `${(bytes / 1024 / 1024).toFixed(1)} MB on this phone`}</Text>
    <Text className="text-sm text-muted-foreground">{status.syncing ? 'Syncing…' : syncedLabel(status.lastSyncAt)}</Text>
    {(status.error || error) && <Text accessibilityLiveRegion="polite" className="text-sm text-destructive">{status.error || error}</Text>}
    <Button variant="outline" disabled={status.syncing || !currentSyncEngine()} onPress={() => void requestCloudSync(true)}><Text>Re-download all data</Text></Button>
  </View>;
}
