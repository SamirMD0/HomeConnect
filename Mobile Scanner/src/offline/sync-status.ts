import { useSyncExternalStore } from 'react';
import type { SyncEngine, SyncStatus } from './sync-engine';
import { manualRefreshAllowed } from './outbox-wake';
let engine: SyncEngine | null = null;
let status: SyncStatus = { syncing: false, lastSyncAt: null, error: null };
let unsubscribe: (() => void) | undefined;
const listeners = new Set<() => void>();
export function syncInitializationError() {
  status = { syncing: false, lastSyncAt: null, error: 'Could not open phone data. Restart the app and try again.' };
  for (const listener of listeners) listener();
}
export function currentSyncEngine() { return engine; }
export function setSyncEngine(value: SyncEngine | null) {
  unsubscribe?.(); engine = value;
  const publish = () => { status = value?.getStatus() ?? { syncing: false, lastSyncAt: null, error: null }; for (const listener of listeners) listener(); };
  unsubscribe = value?.subscribe(publish); publish();
}
export const requestCloudSync = (fullCopy = false) => (fullCopy ? engine?.sync(true) : engine?.request()) ?? Promise.resolve();
let lastUserRefreshAt = 0;
let lastPcRefreshAt = 0;
let followUp: ReturnType<typeof setTimeout> | undefined;
/** A full PC push uploads all figures: ask for one at most every 2 minutes. */
export const PC_REFRESH_MIN_MS = 2 * 60_000;
/** Time for the woken PC to push its changes before the phone reads again. */
export const PC_REFRESH_FOLLOW_UP_MS = 30_000;
/**
 * Pull-to-refresh and opening the Waiting list. Each relay request wakes the
 * Neon database, so a user can trigger at most one sync every 30 seconds;
 * the screen still re-reads the phone's own data right away. It also asks the
 * shop PC for fresh data and reads again once the PC has had time to send it.
 */
export function refreshFromUser(now = Date.now()) {
  if (!manualRefreshAllowed(now, lastUserRefreshAt)) return Promise.resolve();
  lastUserRefreshAt = now;
  const current = engine;
  if (current && now - lastPcRefreshAt >= PC_REFRESH_MIN_MS) {
    lastPcRefreshAt = now;
    void current.askPcForFreshData().then((asked) => {
      if (!asked) return;
      clearTimeout(followUp);
      followUp = setTimeout(() => {
        if (engine === current) void current.request();
      }, PC_REFRESH_FOLLOW_UP_MS);
    });
  }
  return requestCloudSync();
}
/** Test helper. */
export function resetUserRefreshThrottle() {
  lastUserRefreshAt = 0;
  lastPcRefreshAt = 0;
  clearTimeout(followUp);
}
export function useSyncStatus() {
  return useSyncExternalStore(listener => { listeners.add(listener); return () => { listeners.delete(listener); }; }, () => status, () => status);
}
export function syncedLabel(value: string | null, now = Date.now()) {
  if (!value) return 'Not synced yet';
  const minutes = Math.max(0, Math.floor((now - new Date(value).getTime()) / 60000));
  return minutes === 0 ? 'Synced just now' : `Synced ${minutes} min ago`;
}
