import Ionicons from '@expo/vector-icons/Ionicons';
import { useSyncExternalStore } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { theme } from '../theme';
import {
  clearConnectionLog,
  connectionLog,
  subscribeConnectionLog,
  type ConnectionOutcome,
} from './connection-log';

const OUTCOME: Record<ConnectionOutcome, { label: string; icon: keyof typeof Ionicons.glyphMap; color: string }> = {
  ok: { label: 'Connected', icon: 'checkmark-circle', color: theme.colors.success },
  network: { label: 'No answer', icon: 'cloud-offline', color: theme.colors.danger },
  timeout: { label: 'Timed out', icon: 'time', color: theme.colors.warning },
  server: { label: 'PC error', icon: 'warning', color: theme.colors.warning },
  rejected: { label: 'Refused', icon: 'close-circle', color: theme.colors.danger },
};

const time = (at: number) =>
  new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

/** The last connection attempts, newest first. Used in More and on the connect screens. */
export function ConnectionLogPanel({ limit = 60 }: { limit?: number }) {
  const entries = useSyncExternalStore(subscribeConnectionLog, connectionLog).slice(0, limit);
  return (
    <View style={styles.panel}>
      <View style={styles.head}>
        <Text accessibilityRole="header" style={styles.title}>
          Recent attempts
        </Text>
        {entries.length > 0 && (
          <Pressable accessibilityRole="button" hitSlop={10} onPress={clearConnectionLog}>
            <Text style={styles.clear}>Clear</Text>
          </Pressable>
        )}
      </View>
      {entries.length === 0 ? (
        <Text style={styles.empty}>No attempts yet</Text>
      ) : (
        entries.map((entry) => {
          const outcome = OUTCOME[entry.outcome];
          return (
            <View key={entry.id} style={styles.row} accessible accessibilityLabel={`${outcome.label}, ${entry.host}, ${entry.action}, ${entry.ms} milliseconds`}>
              <Ionicons name={outcome.icon} size={20} color={outcome.color} accessible={false} />
              <View style={styles.body}>
                <Text style={styles.line}>
                  <Text style={{ color: outcome.color, fontWeight: '700' }}>{outcome.label}</Text>
                  {'  '}
                  {entry.host}
                </Text>
                <Text style={styles.meta} numberOfLines={2}>
                  {time(entry.at)} · {entry.action} · {entry.ms} ms
                  {entry.detail ? ` · ${entry.detail}` : ''}
                </Text>
              </View>
            </View>
          );
        })
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: theme.colors.text, fontSize: theme.type.body, fontWeight: '700' },
  clear: { color: theme.colors.brand, fontWeight: '700' },
  empty: { color: theme.colors.muted },
  row: { flexDirection: 'row', gap: theme.spacing.sm, alignItems: 'flex-start', paddingVertical: 4 },
  body: { flex: 1 },
  line: { color: theme.colors.text, fontSize: theme.type.small, fontVariant: ['tabular-nums'] },
  meta: { color: theme.colors.muted, fontSize: theme.type.caption, fontVariant: ['tabular-nums'] },
});
