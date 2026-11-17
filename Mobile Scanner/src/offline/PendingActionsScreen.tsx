import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { PageTitle } from '../ui/ScreenHeader';
import { AppButton } from '../components/AppButton';
import { StatusBanner } from '../components/StatusBanner';
import { theme } from '../theme';
import { actionMessage, dismissAction } from './outbox';
import { openLocalDb } from './expo-db';
import { requestCloudSync } from './sync-status';
import { useOutbox } from './useOutbox';
import { ActionResultLink } from './OutboxStatus';
import {summaryArchive} from '../security/summary-archive';
export function PendingActionsScreen({ archivesOnly = false }: { archivesOnly?: boolean }) {
  const rows = useOutbox(archivesOnly),
    client = useQueryClient();
  const [error, setError] = useState(''),
    [refreshing, setRefreshing] = useState(false);
  const refresh = async () => {
    setRefreshing(true);
    try {
      if (!archivesOnly) await requestCloudSync();
      await rows.refetch();
    } finally {
      setRefreshing(false);
    }
  };
  useFocusEffect(
    useCallback(() => {
      if (!archivesOnly) void requestCloudSync();
    }, [archivesOnly])
  );
  return (
    <ScrollView
      contentContainerStyle={{ padding: 16, gap: 16 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}
    >
      <PageTitle title="Waiting for the shop PC" />
      {(error || rows.error) && (
        <StatusBanner
          tone="warning"
          message={error || 'Could not read saved actions. Restart the app and try again.'}
        />
      )}
      {rows.isPending && <Text>Loading saved actions…</Text>}
      {rows.data?.length === 0 && <Text>Nothing waiting.</Text>}
      {rows.data?.map((row) => (
        <View
          key={row.id}
          style={{ padding: 16, gap: 8, backgroundColor: theme.colors.surface, borderRadius: 12 }}
        >
          <Text style={{ color: theme.colors.text, fontWeight: '700' }}>{row.summary}</Text>
          <Text style={{ color: theme.colors.muted }}>
            {new Date(row.created_at).toLocaleString()}
          </Text>
          <StatusBanner
            tone={
              row.local_status === 'applied'
                ? 'success'
                : row.local_status === 'refused' || row.local_status === 'failed'
                  ? 'warning'
                  : 'info'
            }
            message={actionMessage(row)}
          />
          <ActionResultLink row={row}/>
          {['refused', 'failed'].includes(row.local_status) && (
            <AppButton
              label="Dismiss"
              variant="secondary"
              onPress={() => {
                void (async () => {
                  try {
                    if(row.archived===2)await summaryArchive.dismiss(row.id);
                    else await dismissAction(await openLocalDb(), row.id);
                    await client.invalidateQueries({ queryKey: ['cloud-outbox'] });
                  } catch (failure) {
                    setError((failure as Error).message);
                  }
                })();
              }}
            />
          )}
        </View>
      ))}
    </ScrollView>
  );
}
