import { randomUUID, createHash } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createRelayClient, type RelayClient } from './client';
import { RelayStore } from './store';
import type { ActionInput, DeviceInput } from './inputs';

function testDatabase(url: string | undefined) {
  try { return Boolean(url && /(^|[_-])(test|ci)([_-]|$)/i.test(new URL(url).pathname.slice(1))); }
  catch { return false; }
}
const enabled = process.env.RUN_RELAY_DB_TESTS === '1' && testDatabase(process.env.RELAY_DATABASE_URL);
const branchId = randomUUID(), otherBranch = randomUUID(), deviceId = randomUUID(), otherDeviceId = randomUUID();
const userId = randomUUID();
const device: DeviceInput = { id: deviceId, userId, userName: 'Relay fixture', branchIds: [branchId], name: 'Fixture phone',
  tokenSha256: createHash('sha256').update(deviceId).digest('hex') };
const recordIds = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
const pcSeq = BigInt(Date.now());
const input = (id = randomUUID()): ActionInput => ({ id, branchId, type: 'opaque_action', payload: { amount: 'arbitrary opaque string' }, createdAt: new Date().toISOString() });

(enabled ? describe : describe.skip)('relay storage on its isolated database', () => {
  let db: RelayClient;
  let store: RelayStore;
  beforeAll(async () => {
    db = createRelayClient();
    store = new RelayStore(db);
    await store.registerDevice(device);
    await store.registerDevice({ ...device, id: otherDeviceId, tokenSha256: createHash('sha256').update(otherDeviceId).digest('hex') });
  });
  beforeEach(async () => {
    await db.relayOutbox.deleteMany({ where: { deviceId: { in: [deviceId, otherDeviceId] } } });
    await db.relayWorker.update({ where: { id: 1 }, data: { lastUpkeepAt: null } });
  });
  afterAll(async () => {
    if (!db) return;
    await db.relayOutbox.deleteMany({ where: { deviceId: { in: [deviceId, otherDeviceId] } } });
    await db.relayDevice.deleteMany({ where: { id: { in: [deviceId, otherDeviceId] } } });
    await db.relayRecord.deleteMany({ where: { entityId: { in: recordIds } } });
    await db.$disconnect();
  });

  it('allocates increasing revisions on inserts/updates and scopes global, branch and delete records', async () => {
    await store.writeRecords({ pcSeq: pcSeq.toString(), records: [
      { entity: 'product', id: recordIds[0], branchId: null, op: 'upsert', data: { price: 'opaque' } },
      { entity: 'customer', id: recordIds[1], branchId, op: 'upsert', data: { balance: 'PC value' } },
      { entity: 'customer', id: recordIds[2], branchId: otherBranch, op: 'upsert', data: {} },
    ] });
    const before = await db.relayRecord.findMany({ where: { entityId: { in: recordIds } }, orderBy: { rev: 'asc' } });
    expect(before[1].rev).toBeGreaterThan(before[0].rev);
    expect(before[2].rev).toBeGreaterThan(before[1].rev);
    await store.writeRecords({ pcSeq: (pcSeq + 1n).toString(), records: [
      { entity: 'customer', id: recordIds[1], branchId, op: 'delete', data: { discarded: true } },
    ] });
    const deleted = await db.relayRecord.findUniqueOrThrow({ where: { entity_entityId: { entity: 'customer', entityId: recordIds[1] } } });
    expect(deleted.rev).toBeGreaterThan(before[2].rev);
    expect(deleted.data).toBeNull();
    const page = await store.readRecords([branchId], '0', 1);
    expect(page.hasMore).toBe(true);
    const rest = await store.readRecords([branchId], page.nextRev, 500);
    expect(rest.records.some(record => record.id === recordIds[2])).toBe(false);
    expect([...page.records, ...rest.records]).toContainEqual(expect.objectContaining({ id: recordIds[1], op: 'delete', data: null }));
    expect(await store.workerState()).toMatchObject({ lastPcSeq: (pcSeq + 1n).toString() });
  });

  it('rolls back the entire batch and PC cursor if a later record fails', async () => {
    const state = await store.workerState();
    const before = await db.relayRecord.findUniqueOrThrow({ where: { entity_entityId: { entity: 'product', entityId: recordIds[0] } } });
    await expect(store.writeRecords({ pcSeq: (pcSeq + 2n).toString(), records: [
      { entity: 'product', id: recordIds[0], branchId: null, op: 'upsert', data: { changed: true } },
      { entity: 'product', id: 'invalid-uuid', branchId: null, op: 'upsert', data: {} },
    ] })).rejects.toThrow();
    expect(await store.workerState()).toEqual(state);
    expect(await db.relayRecord.findUniqueOrThrow({ where: { entity_entityId: { entity: 'product', entityId: recordIds[0] } } })).toEqual(before);
    await expect(store.writeRecords({ pcSeq: (pcSeq - 1n).toString(), records: [] })).rejects.toMatchObject({ status: 409 });
  });

  it('keeps replayed action IDs with the owning device and stored user', async () => {
    const paired = await db.relayDevice.findUniqueOrThrow({ where: { id: deviceId } });
    const action = input();
    const attempts = await Promise.all([store.enqueue(paired, action), store.enqueue(paired, action)]);
    expect(attempts.map(row => row.created).sort()).toEqual([false, true]);
    expect(await db.relayOutbox.findUniqueOrThrow({ where: { id: action.id } })).toMatchObject({ deviceId, userId });
    const other = await db.relayDevice.findUniqueOrThrow({ where: { id: otherDeviceId } });
    await expect(store.enqueue(other, action)).rejects.toMatchObject({ status: 409 });
    expect(await store.actionResults(otherDeviceId, [action.id])).toEqual([]);
  });

  it('claims distinct actions under concurrent SKIP LOCKED claimers', async () => {
    const paired = await db.relayDevice.findUniqueOrThrow({ where: { id: deviceId } });
    const actions = Array.from({ length: 12 }, () => input());
    for (const action of actions) await store.enqueue(paired, action);
    await store.putBlob(deviceId, actions[0].id, 'image/png', Buffer.from([1, 2, 3]));
    const [first, second] = await Promise.all([store.claim(6), store.claim(6)]);
    const claimed = [...first, ...second];
    expect(first).toHaveLength(6);
    expect(second).toHaveLength(6);
    expect(new Set(claimed.map(row => row.id)).size).toBe(12);
    expect(claimed.map(row => row.id).sort()).toEqual(actions.map(row => row.id).sort());
    expect(claimed.every(row => row.attempts === 1 && row.status === 'claimed')).toBe(true);
    expect(claimed.find(row => row.id === actions[0].id)?.hasBlob).toBe(true);
    await expect(store.putBlob(deviceId, actions[0].id, 'image/png', Buffer.from([4]))).rejects.toMatchObject({ status: 409 });
  });

  it('reclaims five-minute-old claims and leaves fresh claims alone', async () => {
    const paired = await db.relayDevice.findUniqueOrThrow({ where: { id: deviceId } });
    const action = input();
    await store.enqueue(paired, action);
    expect((await store.claim(1))[0].attempts).toBe(1);
    expect(await store.claim(1)).toEqual([]);
    await db.relayOutbox.update({ where: { id: action.id }, data: { claimedAt: new Date(Date.now() - 6 * 60000) } });
    expect((await store.claim(1))[0]).toMatchObject({ id: action.id, attempts: 2 });
  });

  it('preserves the first final result, rejects a conflicting status and removes applied photos', async () => {
    const paired = await db.relayDevice.findUniqueOrThrow({ where: { id: deviceId } });
    const action = input();
    await store.enqueue(paired, action);
    await store.putBlob(deviceId, action.id, 'image/jpeg', Buffer.from([1, 2, 3]));
    await expect(store.putBlob(otherDeviceId, action.id, 'image/png', Buffer.from([1]))).rejects.toMatchObject({ status: 404 });
    await store.saveResult(action.id, { status: 'applied', result: { receiptId: 'PC receipt' } });
    expect(await db.relayBlob.count({ where: { outboxId: action.id } })).toBe(0);
    expect(await store.saveResult(action.id, { status: 'applied', result: { different: true } })).toMatchObject({ result: { receiptId: 'PC receipt' } });
    await expect(store.saveResult(action.id, { status: 'refused', result: {} })).rejects.toMatchObject({ status: 409 });
  });

  it('enforces the blob limit in PostgreSQL as well as HTTP', async () => {
    const paired = await db.relayDevice.findUniqueOrThrow({ where: { id: deviceId } });
    const action = input();
    await store.enqueue(paired, action);
    await expect(store.putBlob(deviceId, action.id, 'image/png', Buffer.alloc(2097153))).rejects.toThrow();
    expect(await db.relayBlob.count({ where: { outboxId: action.id } })).toBe(0);
  });

  it('prunes expired results/blobs and durably limits upkeep to once an hour', async () => {
    const paired = await db.relayDevice.findUniqueOrThrow({ where: { id: deviceId } });
    const old = input(), recent = input(), pending = input(), fresh = input();
    for (const action of [old, recent, pending, fresh]) await store.enqueue(paired, action);
    for (const action of [old, recent, pending, fresh]) await store.putBlob(deviceId, action.id, 'image/png', Buffer.from([1]));
    const now = new Date();
    await db.relayOutbox.update({ where: { id: old.id }, data: { status: 'applied', resolvedAt: new Date(now.getTime() - 31 * 86400000) } });
    await db.relayOutbox.update({ where: { id: recent.id }, data: { status: 'failed', resolvedAt: now } });
    await db.relayBlob.update({ where: { outboxId: pending.id }, data: { createdAt: new Date(now.getTime() - 8 * 86400000) } });
    expect(await store.upkeep(now)).toBe(true);
    expect(await db.relayOutbox.findUnique({ where: { id: old.id } })).toBeNull();
    expect(await db.relayOutbox.findUnique({ where: { id: recent.id } })).not.toBeNull();
    expect(await db.relayOutbox.findUnique({ where: { id: pending.id } })).not.toBeNull();
    expect((await db.relayBlob.findMany({ where: { outboxId: { in: [old.id, recent.id, pending.id, fresh.id] } } })).map(row => row.outboxId)).toEqual([fresh.id]);
    expect(await store.upkeep(new Date(now.getTime() + 3599000))).toBe(false);
    expect(await store.upkeep(new Date(now.getTime() + 3600001))).toBe(true);
  });

  it('retains fresh tombstones and upserts, then removes tombstones after thirty days', async () => {
    await store.writeRecords({ pcSeq: (pcSeq + 3n).toString(), records: [
      { entity: 'product', id: recordIds[3], branchId: null, op: 'delete' },
    ] });
    const now = Date.now();
    await store.upkeep(new Date(now + 29 * 86400000));
    expect(await db.relayRecord.count({ where: { entityId: recordIds[3] } })).toBe(1);
    await store.upkeep(new Date(now + 31 * 86400000));
    expect(await db.relayRecord.count({ where: { entityId: recordIds[3] } })).toBe(0);
    expect(await db.relayRecord.count({ where: { entityId: recordIds[0] } })).toBe(1);
  });

  it('increments UTC usage counters and returns the last thirty-one days with totals', async () => {
    const day = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z');
    const before = await db.relayUsage.findUnique({ where: { day } });
    await store.countUsage({ bytesIn: 123, bytesOut: 456, recordsWritten: 2, actionsReceived: 1 });
    const after = await db.relayUsage.findUniqueOrThrow({ where: { day } });
    expect(after).toMatchObject({
      requests: (before?.requests ?? 0) + 1,
      bytesIn: (before?.bytesIn ?? 0n) + 123n,
      bytesOut: (before?.bytesOut ?? 0n) + 456n,
      recordsWritten: (before?.recordsWritten ?? 0) + 2,
      actionsReceived: (before?.actionsReceived ?? 0) + 1,
    });
    const usage = await store.usage();
    expect(usage.days.some(row => row.day.getTime() === day.getTime())).toBe(true);
    expect(usage.totals.bytesIn).toBeGreaterThanOrEqual(after.bytesIn);
  });
});
