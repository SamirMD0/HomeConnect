import { AppState, Platform } from 'react-native';
import * as BackgroundTask from 'expo-background-task';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import * as TaskManager from 'expo-task-manager';
import * as Updates from 'expo-updates';
import { checkAndNotify, UPDATE_CHANNEL, UPDATE_NOTICE, UPDATE_TASK } from './update-alert';

const NOTIFIED_KEY = 'update-alert.notified';

export async function ensureUpdateChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(UPDATE_CHANNEL, {
    name: 'App updates',
    description: 'Tells you when a new version of Home Connect is ready.',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

/**
 * Must run when the JavaScript bundle loads (imported from index.ts), because
 * Android can start the app without any screen just to run this task.
 */
TaskManager.defineTask(UPDATE_TASK, async () => {
  try {
    await checkAndNotify({
      check: async () => {
        const result = await Updates.checkForUpdateAsync();
        return { isAvailable: result.isAvailable, id: (result.manifest as { id?: string } | undefined)?.id };
      },
      fetch: async () => {
        const result = await Updates.fetchUpdateAsync();
        return { id: (result.manifest as { id?: string } | undefined)?.id };
      },
      onScreen: () => AppState.currentState === 'active',
      lastNotified: () => SecureStore.getItemAsync(NOTIFIED_KEY),
      rememberNotified: (id) => SecureStore.setItemAsync(NOTIFIED_KEY, id),
      notify: async () => {
        await ensureUpdateChannel();
        await Notifications.scheduleNotificationAsync({
          content: { title: UPDATE_NOTICE.title, body: UPDATE_NOTICE.body, data: { ...UPDATE_NOTICE.data } },
          trigger: Platform.OS === 'android' ? { channelId: UPDATE_CHANNEL } : null,
        });
      },
    });
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    // No internet or the update server is down: try again next time.
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});
