import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Updates from 'expo-updates';
import { theme } from '../theme';
import { updateBannerState } from './update-status';

const FOREGROUND_CHECK_MS = 10 * 60 * 1000;

/**
 * Tells the operator when an over-the-air update starts downloading and when
 * it is ready, with a Restart button. Checks again when the app comes back to
 * the foreground (at most every 10 minutes). Draws nothing when updates are off
 * (development) or there is nothing to say.
 */
export function UpdateBanner() {
  const insets = useSafeAreaInsets();
  const { isDownloading, isUpdatePending, downloadProgress } = Updates.useUpdates();
  const [dismissed, setDismissed] = useState(false);
  const lastCheck = useRef(0);

  useEffect(() => {
    if (!Updates.isEnabled) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active' || Date.now() - lastCheck.current < FOREGROUND_CHECK_MS) return;
      lastCheck.current = Date.now();
      void (async () => {
        try {
          const result = await Updates.checkForUpdateAsync();
          if (result.isAvailable) await Updates.fetchUpdateAsync();
        } catch {
          // No internet: keep running the current version silently.
        }
      })();
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (isUpdatePending) setDismissed(false);
  }, [isUpdatePending]);

  const state = updateBannerState({ enabled: Updates.isEnabled, isDownloading, isUpdatePending, progress: downloadProgress });
  if (!state || (state.kind === 'ready' && dismissed)) return null;

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { top: insets.top + 8 }]}>
      <View
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
        style={[styles.banner, state.kind === 'ready' && styles.ready]}
      >
        {state.kind === 'downloading' ? (
          <ActivityIndicator size="small" color={theme.colors.brand} />
        ) : (
          <Ionicons name="checkmark-circle" size={22} color={theme.colors.success} accessible={false} />
        )}
        <Text style={styles.text}>{state.message}</Text>
        {state.kind === 'ready' ? (
          <>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Restart the app to finish the update"
              onPress={() => void Updates.reloadAsync()}
              style={({ pressed }) => [styles.restart, pressed && { opacity: 0.8 }]}
            >
              <Ionicons name="refresh" size={16} color={theme.colors.surface} accessible={false} />
              <Text style={styles.restartText}>Restart</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Later"
              hitSlop={10}
              onPress={() => setDismissed(true)}
            >
              <Ionicons name="close" size={20} color={theme.colors.muted} accessible={false} />
            </Pressable>
          </>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 12, right: 12, zIndex: 100, elevation: 100 },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.brandBorder,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  ready: { borderColor: theme.colors.successBorder },
  text: { flex: 1, color: theme.colors.text, fontSize: 15, fontWeight: '600' },
  restart: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.brand,
  },
  restartText: { color: theme.colors.surface, fontWeight: '700' },
});
