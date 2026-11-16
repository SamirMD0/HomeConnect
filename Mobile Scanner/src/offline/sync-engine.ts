import type { CloudPairing } from './cloud-pairing';
import type { LocalDb } from './local-db';
import { applyRecords, pruneOrders, saveState, stateValue, wipeLocalDb, type CloudRecord } from './record-store';
export interface SyncStatus { syncing: boolean; lastSyncAt: string | null; error: string | null }
interface Page { records: CloudRecord[]; nextRev: string; hasMore: boolean; snapshotHorizon?: string }
class RelayError extends Error { constructor(readonly status: number, readonly code?: string) { super('Relay request failed'); } }
class Cancelled extends Error {}
const cursor = (value: unknown): value is string => typeof value === 'string' && /^\d+$/.test(value) && value.length <= 20;
export class SyncEngine {
  private flight: Promise<void> | null = null;
  private cancelled = false;
  private controller: AbortController | null = null;
  private first = true;
  private listeners = new Set<() => void>();
  private status: SyncStatus = { syncing: false, lastSyncAt: null, error: null };
  constructor(private readonly db: LocalDb, private readonly pairing: CloudPairing,
    private readonly options: { fetch?: typeof fetch; now?: () => Date; onChanged?: () => void; onRevoked?: () => void } = {}) {}
  getStatus = () => this.status;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(value: Partial<SyncStatus>) { this.status = { ...this.status, ...value }; for (const listener of this.listeners) listener(); }
  async restore() { this.publish({ lastSyncAt: await stateValue(this.db, 'lastSyncAt') }); }
  sync = (fullCopy = false): Promise<void> => {
    if (this.cancelled) return Promise.resolve();
    if (this.flight) return this.flight;
    this.flight = this.run(fullCopy).finally(() => { this.flight = null; });
    return this.flight;
  };
  async stopAndWipe() {
    await this.stop();
    await wipeLocalDb(this.db);
    this.publish({ syncing: false, lastSyncAt: null, error: null });
  }
  async stop() { this.cancelled = true; this.controller?.abort(); await this.flight?.catch(() => {}); }
  private active() { if (this.cancelled) throw new Cancelled(); }
  private async page(after: string, fullCopy = false, horizon?: string): Promise<Page> {
    this.active();
    const query = new URLSearchParams({ after, limit: '500' });
    if (fullCopy) query.set('fullCopy', 'true');
    if (horizon !== undefined) query.set('snapshotHorizon', horizon);
    const controller = new AbortController(); this.controller = controller;
    const timer = setTimeout(() => controller.abort(), this.first ? 75000 : 20000); this.first = false;
    try {
      const response = await (this.options.fetch ?? fetch)(`${this.pairing.relay}/relay/v1/device/records?${query}`, {
        headers: { Authorization: `Bearer ${this.pairing.token}` }, signal: controller.signal, redirect: 'error',
      });
      const body = await response.json(); this.active();
      if (!response.ok) throw new RelayError(response.status, body.code ?? body.error?.code);
      if (!Array.isArray(body.records) || body.records.length > 500 || !cursor(body.nextRev) || typeof body.hasMore !== 'boolean' ||
        BigInt(body.nextRev) < BigInt(after) || (body.hasMore && BigInt(body.nextRev) === BigInt(after)) ||
        (fullCopy && !cursor(body.snapshotHorizon))) throw new Error('Invalid relay page');
      for (const record of body.records) {
        if (!record || typeof record.entity !== 'string' || typeof record.id !== 'string' || !cursor(record.rev) ||
          !['upsert', 'delete'].includes(record.op) || (record.branchId !== null && typeof record.branchId !== 'string') ||
          (record.op === 'upsert' && (!record.data || typeof record.data !== 'object' || Array.isArray(record.data)))) throw new Error('Invalid relay record');
      }
      return body;
    } finally { clearTimeout(timer); if (this.controller === controller) this.controller = null; }
  }
  private async fullCopy() {
    for (let restart = 0; restart < 3; restart++) {
      this.active();
      await this.db.transaction(async tx => {
        await tx.exec('DELETE FROM staging_records');
        await saveState(tx, 'fullCopyInProgress', 'true');
        await tx.exec("DELETE FROM sync_state WHERE key='snapshotHorizon'");
      });
      let after = '0', horizon: string | undefined;
      try {
        while (true) {
          const page = await this.page(after, true, horizon); this.active();
          if (horizon !== undefined && horizon !== page.snapshotHorizon) throw new RelayError(410, 'RESYNC_REQUIRED');
          horizon = page.snapshotHorizon!;
          await this.db.transaction(async tx => {
            await applyRecords(tx, 'staging_records', page.records);
            await saveState(tx, 'snapshotHorizon', horizon!);
          });
          after = page.nextRev;
          if (!page.hasMore) break;
        }
        this.active();
        await this.db.transaction(async tx => {
          await tx.exec('DELETE FROM records; INSERT INTO records SELECT * FROM staging_records; DELETE FROM staging_records;');
          await saveState(tx, 'cursor', after);
          await saveState(tx, 'fullCopyInProgress', 'false');
        });
        this.options.onChanged?.(); return;
      } catch (error) {
        if (!(error instanceof RelayError && error.status === 410)) throw error;
      }
    }
    throw new Error('Full copy keeps changing');
  }
  private async run(force: boolean) {
    this.first = true; this.publish({ syncing: true, error: null });
    try {
      if (force || !(await stateValue(this.db, 'cursor')) || await stateValue(this.db, 'fullCopyInProgress') === 'true') await this.fullCopy();
      let recoveries = 0;
      while (true) {
        const after = (await stateValue(this.db, 'cursor')) ?? '0';
        let page: Page;
        try { page = await this.page(after); }
        catch (error) {
          if (error instanceof RelayError && error.status === 410 && recoveries++ < 3) { await this.fullCopy(); continue; }
          throw error;
        }
        this.active();
        await this.db.transaction(async tx => { await applyRecords(tx, 'records', page.records); await saveState(tx, 'cursor', page.nextRev); });
        this.options.onChanged?.();
        if (!page.hasMore) break;
      }
      this.active();
      const now = (this.options.now ?? (() => new Date()))();
      await this.db.transaction(async tx => { await pruneOrders(tx, now); await saveState(tx, 'lastSyncAt', now.toISOString()); });
      this.publish({ lastSyncAt: now.toISOString() }); this.options.onChanged?.();
    } catch (error) {
      if (error instanceof RelayError && error.status === 401) {
        this.cancelled = true;
        await wipeLocalDb(this.db);
        this.publish({ lastSyncAt: null, error: error.code === 'DEVICE_REVOKED' ? 'This phone was removed by the shop.' : 'Pair this phone again from the shop PC.' });
        // Do not await a callback that may join this flight while clearing the session.
        this.options.onRevoked?.();
      } else if (!(error instanceof Cancelled) && !this.cancelled) {
        this.publish({ error: 'Could not sync. Your saved data is available. Check your internet connection and try again.' });
      }
    } finally { this.publish({ syncing: false }); }
  }
}
