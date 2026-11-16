import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useSession } from '../session/SessionProvider';
import { queryClient } from '../query/client';
import { openLocalDb } from './expo-db';
import { onCloudWipe, configureCloudReader } from './cloud-mode';
import { wipeLocalDb, saveState, stateValue } from './record-store';
import { CloudDataSource } from './data-source';
import type { AccountUser } from '@shared/mobile-contracts';
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
      if (await stateValue(db, 'deviceId') !== pairing.deviceId) { await wipeLocalDb(db); await saveState(db, 'deviceId', pairing.deviceId); }
      if (!active) return;
      const source = new CloudDataSource(db, pairing.branchIds);
      configureCloudReader((url, init) => source.read(url, init));
      const hydrate = async () => {
        const user = (await db.query<{ data: string }>("SELECT data FROM records WHERE entity='user' AND id=?", [pairing.userId]))[0];
        const branches = await db.query<{ id: string; name: string }>("SELECT id,name FROM records WHERE entity='branch'");
        if (active) latest.current.updateCloudIdentity(user ? JSON.parse(user.data) as AccountUser : null, branches);
      };
      engine = new SyncEngine(db, pairing, {
        onChanged: () => { void hydrate().catch(() => {}); void queryClient.invalidateQueries(); },
        onRevoked: () => { void latest.current.signOut('This phone was removed by the shop.').catch(() => {}); },
      });
      setSyncEngine(engine); await engine.restore(); await hydrate();
      if (active) await engine.sync();
    };
    void start().catch(() => {});
    const timer = setInterval(() => { if (AppState.currentState === 'active') void engine?.sync(); }, 15 * 60000);
    const listener = AppState.addEventListener('change', state => { if (state === 'active') void engine?.sync(); });
    return () => { active = false; clearInterval(timer); listener.remove(); void engine?.stop(); if (currentSyncEngine() === engine) { setSyncEngine(null); configureCloudReader(null); } };
  }, [pairing]);
  return null;
}
