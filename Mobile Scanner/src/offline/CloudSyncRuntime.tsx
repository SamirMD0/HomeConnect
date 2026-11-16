import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useSession } from '../session/SessionProvider';
import { queryClient } from '../query/client';
import { openLocalDb } from './expo-db';
import { onCloudWipe } from './cloud-mode';
import { wipeLocalDb } from './record-store';
import { SyncEngine } from './sync-engine';
import { currentSyncEngine, setSyncEngine } from './sync-status';

// Also registered before first pairing, so changing users cannot reuse an old cache.
onCloudWipe(async () => {
  const current = currentSyncEngine();
  if (current) await current.stopAndWipe();
  else await wipeLocalDb(await openLocalDb());
});
export function CloudSyncRuntime() {
  const session = useSession();
  const latest = useRef(session); latest.current = session;
  const pairing = session.cloudPairing;
  useEffect(() => {
    if (!pairing) return;
    let active = true, engine: SyncEngine | undefined;
    const start = async () => {
      const db = await openLocalDb();
      if (!active) return;
      engine = new SyncEngine(db, pairing, {
        onChanged: () => { void queryClient.invalidateQueries(); },
        onRevoked: () => { void latest.current.signOut('This phone was removed by the shop.').catch(() => {}); },
      });
      setSyncEngine(engine); await engine.restore();
      if (active) await engine.sync();
    };
    void start().catch(() => {});
    const timer = setInterval(() => { if (AppState.currentState === 'active') void engine?.sync(); }, 15 * 60000);
    const listener = AppState.addEventListener('change', state => { if (state === 'active') void engine?.sync(); });
    return () => { active = false; clearInterval(timer); listener.remove(); void engine?.stop(); if (currentSyncEngine() === engine) setSyncEngine(null); };
  }, [pairing]);
  return null;
}
