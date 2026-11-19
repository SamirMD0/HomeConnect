import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { useSession } from '../session/SessionProvider';
import { clearQueryCache, queryClient } from '../query/client';
import { saveCloudPairing } from './cloud-storage';
import { openLocalDb, deleteLocalDb } from './expo-db';
import { stopLocalSecurity, securityStatus } from '../security/runtime';
import { onCloudWipe, configureCloudReader } from './cloud-mode';
import { wipeLocalDb, saveState, stateValue } from './record-store';
import { CloudDataSource } from './data-source';
import type { AccountUser } from '@shared/mobile-contracts';
import { SyncEngine } from './sync-engine';
import { currentSyncEngine, setSyncEngine, syncInitializationError } from './sync-status';
import { configureOutbox, waitForOutboxSaves } from './outbox-runtime';
import { listOutbox, ownerKey } from './outbox';
import { wipeCloudDrafts } from '../sales/draft-files';
import { outboxWakeReason } from './outbox-wake';

let generation = 0;
let starting: Promise<void> | undefined;

// Also registered before first pairing, so changing users cannot reuse an old cache.
onCloudWipe(async () => {
  generation++;
  await stopLocalSecurity();
  configureOutbox(null);
  await waitForOutboxSaves();
  const current = currentSyncEngine();
  await current?.stop();
  await starting?.catch(() => {});
  await wipeCloudDrafts();
  await deleteLocalDb();
});
export function CloudSyncRuntime() {
  const session = useSession();
  const latest = useRef(session);
  latest.current = session;
  const pairing = session.cloudPairing;
  const connectionKey = pairing
    ? JSON.stringify([pairing.relay, pairing.deviceId, pairing.token])
    : null;
  useEffect(() => {
    if (!pairing) return;
    const owner = generation;
    let currentPairing = pairing;
    let active = true,
      engine: SyncEngine | undefined;
    const start = async () => {
      const db = await openLocalDb();
      if (!active || owner !== generation) return;
      if ((await stateValue(db, 'deviceId')) !== pairing.deviceId) {
        await wipeLocalDb(db);
        await saveState(db, 'deviceId', pairing.deviceId);
      }
      if (!active || owner !== generation) return;
      const source = new CloudDataSource(db, pairing.branchIds, pairing.role, ownerKey(pairing));
      configureOutbox(pairing);
      configureCloudReader((url, init) => source.read(url, init));
      // Cached reads become available before a sleeping/offline relay is contacted.
      void queryClient.invalidateQueries();
      const hydrate = async () => {
        const user = (
          await db.query<{ data: string }>(
            "SELECT data FROM records WHERE entity='user' AND id=?",
            [currentPairing.userId]
          )
        )[0];
        const branches = await db.query<{ id: string; name: string }>(
          "SELECT id,name FROM records WHERE entity='branch'"
        );
        if (active && owner === generation)
          latest.current.updateCloudIdentity(
            user ? (JSON.parse(user.data) as AccountUser) : null,
            branches
          );
      };
      engine = new SyncEngine(db, pairing, {
        securityStatus: current => securityStatus(ownerKey(current)),
        onBeforeUserChanged: async () => {
          configureOutbox(null);
          await waitForOutboxSaves();
          await wipeCloudDrafts();
        },
        onPairingChanged: async (next) => {
          if (!active || owner !== generation) throw new Error('Cloud session changed');
          currentPairing = next;
          configureOutbox(next);
          const nextSource = new CloudDataSource(db, next.branchIds, next.role, ownerKey(next));
          configureCloudReader((url, init) => nextSource.read(url, init));
          await clearQueryCache();
          if (!active || owner !== generation) throw new Error('Cloud session changed');
          latest.current.updateCloudPairing(next);
          await saveCloudPairing(next);
        },
        onChanged: () => {
          void hydrate().catch(() => {});
          void queryClient.invalidateQueries();
        },
        onRevoked: (message) => {
          void latest.current.signOut(message).catch(() => {});
        },
      });
      setSyncEngine(engine);
      await engine.restore();
      await hydrate();
      if (active && owner === generation) await engine.sync();
    };
    starting = start().catch(() => {
      if (active && owner === generation) syncInitializationError();
    });
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') void engine?.sync();
    }, 15 * 60000);
    const listener = AppState.addEventListener('change', (state) => {
      if (state === 'active') void engine?.sync();
    });
    const online = NetInfo.addEventListener((state) => {
      if (state.isConnected && AppState.currentState === 'active') void engine?.sync();
    });
    let checking = false;
    // Foreground only. Sending unsent actions may retry every 30 s; actions
    // already on the relay only need their PC result, checked every 5 min.
    const wake = { lastSendWakeAt: 0, lastResultCheckAt: Date.now() };
    const retry = setInterval(() => {
      if (
        checking ||
        !active ||
        AppState.currentState !== 'active' ||
        engine?.getStatus().syncing ||
        (engine?.getRetryAt() ?? 0) > Date.now()
      )
        return;
      checking = true;
      void openLocalDb()
        .then((db) => listOutbox(db, ownerKey(currentPairing)))
        .then((rows) => {
          if (!active || owner !== generation) return;
          const lastSync = engine?.getStatus().lastSyncAt;
          if (lastSync) wake.lastResultCheckAt = Math.max(wake.lastResultCheckAt, Date.parse(lastSync));
          const now = Date.now();
          const reason = outboxWakeReason(rows, now, wake);
          if (!reason) return;
          if (reason === 'send') wake.lastSendWakeAt = now;
          else wake.lastResultCheckAt = now;
          void engine?.sync();
        })
        .catch(() => {})
        .finally(() => {
          checking = false;
        });
    }, 15000);
    return () => {
      active = false;
      clearInterval(timer);
      clearInterval(retry);
      online();
      listener.remove();
      void engine?.stop();
      if (currentSyncEngine() === engine) {
        configureOutbox(null);
        setSyncEngine(null);
        configureCloudReader(null);
      }
    };
  }, [connectionKey]);
  return null;
}
