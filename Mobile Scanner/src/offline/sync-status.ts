import { useSyncExternalStore } from 'react';
import type { SyncEngine, SyncStatus } from './sync-engine';
let engine: SyncEngine | null = null;
let status: SyncStatus = { syncing: false, lastSyncAt: null, error: null };
let unsubscribe: (() => void) | undefined;
const listeners = new Set<() => void>();
export function currentSyncEngine() { return engine; }
export function setSyncEngine(value: SyncEngine | null) {
  unsubscribe?.(); engine = value;
  const publish = () => { status = value?.getStatus() ?? { syncing: false, lastSyncAt: null, error: null }; for (const listener of listeners) listener(); };
  unsubscribe = value?.subscribe(publish); publish();
}
export const requestCloudSync = (fullCopy = false) => engine?.sync(fullCopy) ?? Promise.resolve();
export function useSyncStatus() {
  return useSyncExternalStore(listener => { listeners.add(listener); return () => { listeners.delete(listener); }; }, () => status, () => status);
}
export function syncedLabel(value: string | null, now = Date.now()) {
  if (!value) return 'Not synced yet';
  const minutes = Math.max(0, Math.floor((now - new Date(value).getTime()) / 60000));
  return minutes === 0 ? 'Synced just now' : `Synced ${minutes} min ago`;
}
