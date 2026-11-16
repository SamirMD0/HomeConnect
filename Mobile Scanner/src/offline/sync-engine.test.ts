import { describe, expect, it, vi } from 'vitest';
import { memoryDb } from './testing/memory-db';
import { applyRecords, saveState, stateValue, type CloudRecord } from './record-store';
import { SyncEngine } from './sync-engine';
import { pairedUser, type CloudPairing } from './cloud-pairing';
import { can } from '../permissions/can';
const pairing: CloudPairing = { v: 1, relay: 'https://relay.example', token: 'device-secret',
  deviceId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', userId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  userName: 'Shop user', role: 'EMPLOYEE', branchIds: ['cccccccc-cccc-4ccc-8ccc-cccccccccccc'] };
const profile = ({ deviceId, userId, userName, role, branchIds }: CloudPairing) => ({ deviceId, userId, userName, role, branchIds });
const row = (id: string, rev = '1', data: object = { name: id }): CloudRecord => ({ entity: 'product', id, branchId: null, rev, data, op: 'upsert' });
const page = (records: CloudRecord[], nextRev: string, hasMore = false, snapshotHorizon = '0') => new Response(JSON.stringify({ records, nextRev, hasMore, snapshotHorizon }));
const failure = (status: number, code: string) => new Response(JSON.stringify({ code }), { status });
function recordEngine(...[db, device, options = {}]: ConstructorParameters<typeof SyncEngine>) {
  const send = options.fetch ?? fetch;
  return new SyncEngine(db, device, { ...options, fetch: (url, init) => String(url).endsWith('/me')
    ? Promise.resolve(new Response(JSON.stringify(profile(device)))) : send(url, init) });
}

describe('offline relay sync with real in-memory SQLite', () => {
  it('refreshes /me exactly once before records in every sync and updates role-driven menus', async () => {
    const db = await memoryDb(); await saveState(db, 'cursor', '1');
    let role: 'ADMIN' | 'EMPLOYEE' = 'ADMIN';
    const changed = vi.fn().mockResolvedValue(undefined);
    const fetcher = vi.fn(async (url: RequestInfo | URL) => String(url).endsWith('/me')
      ? new Response(JSON.stringify({ ...profile(pairing), role })) : page([], '1'));
    const engine = new SyncEngine(db, pairing, { fetch: fetcher, onPairingChanged: changed });
    await engine.sync(); role = 'EMPLOYEE'; await engine.sync();
    expect(fetcher.mock.calls.map(([url]) => new URL(String(url)).pathname)).toEqual([
      '/relay/v1/device/me', '/relay/v1/device/records', '/relay/v1/device/me', '/relay/v1/device/records',
    ]);
    expect(changed.mock.calls.map(([next]) => next.role)).toEqual(['ADMIN', 'EMPLOYEE']);
    expect(changed.mock.calls.map(([next]) => can('supplierPayments.write', pairedUser(next)))).toEqual([true, false]);
    expect(changed.mock.calls[0]![0]).toMatchObject({ token: pairing.token, deviceId: pairing.deviceId });
  });

  it('resumes a full copy after a branch update even if saving the refreshed pairing interrupted the prior sync', async () => {
    const db = await memoryDb(); await saveState(db, 'cursor', '99'); await applyRecords(db, 'records', [row('old-scope')]);
    const next: CloudPairing = { ...pairing, role: 'ADMIN', branchIds: ['dddddddd-dddd-4ddd-8ddd-dddddddddddd'] };
    const save = vi.fn(async () => { expect(await stateValue(db, 'fullCopyInProgress')).toBe('true'); throw Error('interrupted after pairing save'); });
    const firstFetch = vi.fn(async () => new Response(JSON.stringify(profile(next))));
    await new SyncEngine(db, pairing, { fetch: firstFetch, onPairingChanged: save }).sync();
    expect(firstFetch).toHaveBeenCalledOnce();
    expect(save).toHaveBeenCalledWith(next);
    const fetcher = vi.fn(async (url: RequestInfo | URL) => String(url).endsWith('/me') ? new Response(JSON.stringify(profile(next))) :
      new URL(String(url)).searchParams.get('fullCopy') === 'true' ? page([row('new-scope', '5')], '5') : page([], '5'));
    await new SyncEngine(db, next, { fetch: fetcher }).sync();
    expect(new URL(String(fetcher.mock.calls[1]![0])).searchParams.get('after')).toBe('0');
    expect(await db.query('SELECT id FROM records')).toEqual([{ id: 'new-scope' }]);
    expect(await stateValue(db, 'cursor')).toBe('5');
  });

  it('applies the existing revocation wipe when /me rejects the credential before any records request', async () => {
    const db = await memoryDb(); await saveState(db, 'cursor', '1'); await applyRecords(db, 'records', [row('private')]);
    const revoked = vi.fn(), fetcher = vi.fn().mockResolvedValue(failure(401, 'DEVICE_REVOKED'));
    await new SyncEngine(db, pairing, { fetch: fetcher, onRevoked: revoked }).sync();
    expect(fetcher).toHaveBeenCalledOnce();
    expect(String(fetcher.mock.calls[0]![0])).toMatch(/\/me$/);
    expect(await db.query('SELECT * FROM records')).toEqual([]);
    expect(await stateValue(db, 'cursor')).toBeNull();
    expect(revoked).toHaveBeenCalledWith('This phone was removed by the shop.');
  });

  it('joins a pending profile save before unpair cleanup and never starts a records request afterwards', async () => {
    const db = await memoryDb(); await saveState(db, 'cursor', '1');
    let release!: () => void, reached!: () => void;
    const waiting = new Promise<void>(resolve => { reached = resolve; });
    const save = vi.fn(async () => { reached(); await new Promise<void>(resolve => { release = resolve; }); });
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ...profile(pairing), role: 'ADMIN' })));
    const engine = new SyncEngine(db, pairing, { fetch: fetcher, onPairingChanged: save });
    const running = engine.sync(); await waiting;
    let wiped = false;
    const cleanup = engine.stopAndWipe().then(() => { wiped = true; });
    await Promise.resolve(); expect(wiped).toBe(false);
    release(); await cleanup; await running;
    expect(fetcher).toHaveBeenCalledOnce();
    expect(await stateValue(db, 'cursor')).toBeNull();
  });
  it('keeps old data visible while a fresh full copy downloads, then swaps atomically', async () => {
    const db = await memoryDb(); await applyRecords(db, 'records', [row('old')]); await saveState(db, 'cursor', '99');
    let release!: (value: Response) => void, reached!: () => void;
    const waiting = new Promise<void>(resolve => { reached = resolve; });
    const fetcher = vi.fn().mockResolvedValueOnce(page([row('new')], '1', true, '5'))
      .mockImplementationOnce(() => { reached(); return new Promise<Response>(resolve => { release = resolve; }); })
      .mockResolvedValue(page([], '6'));
    const engine = recordEngine(db, pairing, { fetch: fetcher });
    const running = engine.sync(true); await waiting;
    expect(await db.query('SELECT id FROM records')).toEqual([{ id: 'old' }]);
    expect(await stateValue(db, 'cursor')).toBe('99');
    release(page([row('second', '6')], '6', false, '5')); await running;
    expect(await db.query('SELECT id FROM records ORDER BY id')).toEqual([{ id: 'new' }, { id: 'second' }]);
    expect(await stateValue(db, 'cursor')).toBe('6');
    const continuation = new URL(fetcher.mock.calls[1]![0]);
    expect(continuation.searchParams.get('fullCopy')).toBe('true');
    expect(continuation.searchParams.get('snapshotHorizon')).toBe('5');
  });
  it('restarts at zero and clears staging when the horizon advances', async () => {
    const db = await memoryDb();
    const fetcher = vi.fn().mockResolvedValueOnce(page([row('discard')], '1', true, '5'))
      .mockResolvedValueOnce(failure(410, 'RESYNC_REQUIRED')).mockResolvedValueOnce(page([row('keep', '9')], '9', false, '8')).mockResolvedValue(page([], '9'));
    await recordEngine(db, pairing, { fetch: fetcher }).sync();
    expect(await db.query('SELECT id FROM records')).toEqual([{ id: 'keep' }]);
    expect(new URL(fetcher.mock.calls[2]![0]).searchParams.get('after')).toBe('0');
  });
  it('applies delta upserts and branch-move deletes and advances an exact bigint cursor', async () => {
    const db = await memoryDb(); await applyRecords(db, 'records', [row('moved')]); await saveState(db, 'cursor', '9007199254740993');
    const fetcher = vi.fn().mockResolvedValue(page([row('new', '9007199254740994'), { ...row('moved', '9007199254740995'), op: 'delete', data: null }], '9007199254740995'));
    await recordEngine(db, pairing, { fetch: fetcher }).sync();
    expect(await db.query('SELECT id FROM records')).toEqual([{ id: 'new' }]);
    expect(await stateValue(db, 'cursor')).toBe('9007199254740995');
    expect(new URL(fetcher.mock.calls[0]![0]).searchParams.has('fullCopy')).toBe(false);
  });
  it('rolls back a delta page if cursor persistence fails', async () => {
    const db = await memoryDb(); await saveState(db, 'cursor', '10');
    const failing = { ...db, transaction: <T,>(work: Parameters<typeof db.transaction<T>>[0]) => db.transaction(tx => work({ ...tx, exec: async (sql, params) => {
      if (params?.[0] === 'cursor' && params[1] === '11') throw Error('disk write failed');
      await tx.exec(sql, params);
    } })) };
    const engine = recordEngine(failing, pairing, { fetch: vi.fn().mockResolvedValue(page([row('new', '11')], '11')) });
    await engine.sync();
    expect(await db.query('SELECT id FROM records')).toEqual([]);
    expect(await stateValue(db, 'cursor')).toBe('10');
    expect(engine.getStatus().error).toContain('saved data is available');
  });
  it('replaces live data after a stale delta cursor receives 410', async () => {
    const db = await memoryDb(); await applyRecords(db, 'records', [row('deleted-long-ago')]); await saveState(db, 'cursor', '1');
    const fetcher = vi.fn().mockResolvedValueOnce(failure(410, 'RESYNC_REQUIRED')).mockResolvedValueOnce(page([row('current', '8')], '8', false, '7')).mockResolvedValue(page([], '8'));
    await recordEngine(db, pairing, { fetch: fetcher }).sync();
    expect(await db.query('SELECT id FROM records')).toEqual([{ id: 'current' }]);
    expect(await stateValue(db, 'fullCopyInProgress')).toBe('false');
  });
  it('wipes records and cursor on device revocation and notifies session teardown', async () => {
    const db = await memoryDb(); await applyRecords(db, 'records', [row('private')]); await saveState(db, 'cursor', '1');
    const revoked = vi.fn();
    const engine = recordEngine(db, pairing, { fetch: vi.fn().mockResolvedValue(failure(401, 'DEVICE_REVOKED')), onRevoked: revoked });
    await engine.sync();
    expect(await db.query('SELECT * FROM records')).toEqual([]);
    expect(await stateValue(db, 'cursor')).toBeNull();
    expect(revoked).toHaveBeenCalledOnce();
    expect(revoked).toHaveBeenCalledWith('This phone was removed by the shop.');
    expect(engine.getStatus().error).toBe('This phone was removed by the shop.');
  });
  it('joins concurrent sync triggers and never restores data after unpair', async () => {
    const db = await memoryDb(); await saveState(db, 'cursor', '1');
    let release!: (value: Response) => void;
    const fetcher = vi.fn().mockImplementation(() => new Promise<Response>(resolve => { release = resolve; }));
    const engine = recordEngine(db, pairing, { fetch: fetcher });
    const first = engine.sync(); expect(engine.sync()).toBe(first);
    while (!release) await new Promise(resolve => setTimeout(resolve, 0));
    const wiping = engine.stopAndWipe(); release(page([row('late', '2')], '2'));
    await wiping;
    expect(await db.query('SELECT id FROM records')).toEqual([]);
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it('prunes orders older than ninety days without changing money or current orders', async () => {
    const db = await memoryDb(); await saveState(db, 'cursor', '1');
    await applyRecords(db, 'records', [
      { ...row('old'), entity: 'sales_order', data: { orderDate: '2026-01-01', totalAmount: '999999999999999.99' } },
      { ...row('keep'), entity: 'sales_order', data: { orderDate: '2026-11-01', totalAmount: '9007199254740993.25' } },
    ]);
    await recordEngine(db, pairing, { fetch: vi.fn().mockResolvedValue(page([], '1')), now: () => new Date('2026-11-16T12:00:00Z') }).sync();
    const records = await db.query<{ data: string }>('SELECT data FROM records');
    expect(records).toHaveLength(1); expect(JSON.parse(records[0]!.data).totalAmount).toBe('9007199254740993.25');
  });
});
