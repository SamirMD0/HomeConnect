import { useEffect } from 'react';
import { Alert } from 'react-native';
import * as BackgroundTask from 'expo-background-task';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import * as TaskManager from 'expo-task-manager';
import * as Updates from 'expo-updates';
import { CHECK_EVERY_MINUTES, shouldOfferAlerts, UPDATE_TASK } from './update-alert';
import { ensureUpdateChannel } from './update-alert-task';

const OFFERED_KEY = 'update-alert.offered';

async function register() {
  if ((await BackgroundTask.getStatusAsync()) !== BackgroundTask.BackgroundTaskStatus.Available) return;
  if (await TaskManager.isTaskRegisteredAsync(UPDATE_TASK)) return;
  await BackgroundTask.registerTaskAsync(UPDATE_TASK, { minimumInterval: CHECK_EVERY_MINUTES });
}

async function offerOnce() {
  const permission = await Notifications.getPermissionsAsync();
  if (!shouldOfferAlerts(permission, (await SecureStore.getItemAsync(OFFERED_KEY)) === '1')) return;
  await SecureStore.setItemAsync(OFFERED_KEY, '1');
  Alert.alert(
    'Get update alerts?',
    'Home Connect can tell you when a new version is ready, even when the app is closed.',
    [
      { text: 'Not now', style: 'cancel' },
      { text: 'Allow', onPress: () => void Notifications.requestPermissionsAsync().catch(() => {}) },
    ]
  );
}

/**
 * Mounted behind the lock: registers the background update check and, once,
 * asks to allow notifications. Draws nothing. Off in development builds.
 */
export function UpdateAlerts() {
  useEffect(() => {
    if (!Updates.isEnabled) return;
    void (async () => {
      try {
        await ensureUpdateChannel();
        await register();
        await offerOnce();
      } catch {
        // Alerts are a convenience; the in-app banner still works without them.
      }
    })();
  }, []);
  return null;
}
