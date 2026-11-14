import { randomUUID, createHash } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createRelayClient, type RelayClient } from './client';
import { RelayStore } from './store';
import { createRelayApp } from './app';
import type { ActionInput, DeviceInput } from './inputs';

function testDatabase(url: string | undefined) {
  try { return Boolean(url && /_(test|ci)$/i.test(new URL(url).pathname.slice(1))); }
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

  it('holds declared photos out of claims until a matching upload commits', async () => {
    const paired = await db.relayDevice.findUniqueOrThrow({ where: { id: deviceId } });
    const action: ActionInput = { ...input(), photo: { mime: 'image/png', size: 100 } };
    expect(await store.enqueue(paired, action)).toMatchObject({ status: 'awaiting_photo' });
    expect(await store.enqueue(paired, action)).toMatchObject({ created: false, status: 'awaiting_photo' });
    expect(await store.claim(50)).toEqual([]);
    expect(await store.actionResults(deviceId, [action.id])).toEqual([
      expect.objectContaining({ id: action.id, status: 'awaiting_photo' }),
    ]);
    await expect(store.putBlob(deviceId, action.id, 'image/png', Buffer.alloc(106))).rejects.toMatchObject({ status: 400 });
    await expect(store.putBlob(deviceId, action.id, 'image/jpeg', Buffer.alloc(100))).rejects.toMatchObject({ status: 400 });
    expect(await db.relayBlob.count({ where: { outboxId: action.id } })).toBe(0);
    expect((await db.relayOutbox.findUniqueOrThrow({ where: { id: action.id } })).status).toBe('awaiting_photo');
    await store.putBlob(deviceId, action.id, 'image/png', Buffer.alloc(105));
    expect((await db.relayOutbox.findUniqueOrThrow({ where: { id: action.id } })).status).toBe('pending');
    // Ready actions retain the existing replacement behavior before a claim.
    await store.putBlob(deviceId, action.id, 'image/jpeg', Buffer.alloc(20));

    const lower: ActionInput = { ...input(), photo: { mime: 'image/png', size: 100 } };
    await store.enqueue(paired, lower);
    await expect(store.putBlob(deviceId, lower.id, 'image/png', Buffer.alloc(94))).rejects.toMatchObject({ status: 400 });
    await store.putBlob(deviceId, lower.id, 'image/png', Buffer.alloc(95));
    const ready = await store.claim(50);
    expect(ready.map(row => row.id).sort()).toEqual([action.id, lower.id].sort());
    expect(ready.every(row => row.hasBlob)).toBe(true);

    const racing: ActionInput = { ...input(), photo: { mime: 'image/png', size: 100 } };
    await store.enqueue(paired, racing);
    const [, claimed] = await Promise.all([
      store.putBlob(deviceId, racing.id, 'image/png', Buffer.alloc(100)), store.claim(50),
    ]);
    expect(claimed.every(row => row.hasBlob)).toBe(true);
    if (!claimed.length) expect((await store.claim(50))[0]).toMatchObject({ id: racing.id, hasBlob: true });
  });

  it('fails abandoned photo declarations after seven server-received days', async () => {
    const paired = await db.relayDevice.findUniqueOrThrow({ where: { id: deviceId } });
    const old: ActionInput = { ...input(), photo: { mime: 'image/png', size: 100 } };
    const recent: ActionInput = { ...input(), photo: { mime: 'image/png', size: 100 } };
    await store.enqueue(paired, old);
    await store.enqueue(paired, recent);
    const now = new Date();
    await db.relayOutbox.update({ where: { id: old.id }, data: { receivedAt: new Date(now.getTime() - 8 * 86400000) } });
    await store.upkeep(now);
    expect(await store.actionResults(deviceId, [old.id])).toEqual([
      expect.objectContaining({ status: 'failed', result: { reason: 'PHOTO_NEVER_ARRIVED' }, resolvedAt: now }),
    ]);
    expect(await store.actionResults(deviceId, [recent.id])).toEqual([expect.objectContaining({ status: 'awaiting_photo' })]);
    await expect(store.putBlob(deviceId, old.id, 'image/png', Buffer.alloc(100))).rejects.toMatchObject({ status: 409 });
    expect(await store.claim(50)).toEqual([]);
  });

  it('sends branch-move deletes to A and current upserts to B and A+B without duplicate history', async () => {
    const id = randomUUID();
    recordIds.push(id);
    let sequence = BigInt((await store.workerState()).lastPcSeq);
    const write = async (branch: string) => store.writeRecords({ pcSeq: (++sequence).toString(), records: [
      { entity: 'customer', id, branchId: branch, op: 'upsert', data: { name: 'Moved record', balance: 'PC data' } },
    ] });
    await write(branchId);
    const initial = await db.relayRecord.findUniqueOrThrow({ where: { entity_entityId: { entity: 'customer', entityId: id } } });
    await write(otherBranch);
    const moved = await db.relayRecord.findUniqueOrThrow({ where: { entity_entityId: { entity: 'customer', entityId: id } } });
    const fromA = await store.readRecords([branchId], initial.rev.toString(), 500);
    const fromB = await store.readRecords([otherBranch], initial.rev.toString(), 500);
    const fromBoth = await store.readRecords([branchId, otherBranch], initial.rev.toString(), 500);
    expect(fromA.records).toEqual([expect.objectContaining({ id, op: 'delete', data: null, rev: moved.rev.toString() })]);
    for (const result of [fromB, fromBoth]) {
      expect(result.records).toEqual([expect.objectContaining({ id, op: 'upsert', data: { name: 'Moved record', balance: 'PC data' }, rev: moved.rev.toString() })]);
      expect(result.records[0]).not.toHaveProperty('previousBranchIds');
    }
    await write(branchId);
    await write(otherBranch);
    const repeated = await db.relayRecord.findUniqueOrThrow({ where: { entity_entityId: { entity: 'customer', entityId: id } } });
    expect([...repeated.previousBranchIds].sort()).toEqual([branchId, otherBranch].sort());
  });

  it('requires a full resync below the pruned horizon and preserves the horizon on later upkeep', async () => {
    const id = randomUUID();
    recordIds.push(id);
    await store.writeRecords({ pcSeq: (BigInt((await store.workerState()).lastPcSeq) + 1n).toString(), records: [
      { entity: 'customer', id, branchId, op: 'delete' },
    ] });
    const deleted = await db.relayRecord.findUniqueOrThrow({ where: { entity_entityId: { entity: 'customer', entityId: id } } });
    const now = Date.now();
    await store.upkeep(new Date(now + 31 * 86400000));
    const horizon = (await db.relayWorker.findUniqueOrThrow({ where: { id: 1 } })).prunedThroughRev;
    expect(horizon).toBe(deleted.rev);
    const app = createRelayApp({ store, workerTokenSha256: createHash('sha256').update('review-worker-secret').digest('hex'), log: () => {} });
    const secret = 'review-device-secret';
    await db.relayDevice.update({ where: { id: deviceId }, data: { tokenSha256: createHash('sha256').update(secret).digest('hex') } });
    const response = await request(app).get('/relay/v1/device/records?after=' + (horizon - 1n).toString()).set('Authorization', 'Bearer ' + secret);
    expect(response.status).toBe(410);
    expect(response.body).toEqual({ code: 'RESYNC_REQUIRED' });
    for (const after of ['0', horizon.toString(), (horizon + 1n).toString()]) {
      expect((await request(app).get('/relay/v1/device/records?after=' + after).set('Authorization', 'Bearer ' + secret)).status).toBe(200);
    }
    const fullCopy = await store.readRecords([branchId], '0', 500);
    expect(fullCopy.hasMore).toBe(false);
    expect(BigInt(fullCopy.nextRev)).toBeGreaterThanOrEqual(horizon);
    await expect(store.readRecords([branchId], fullCopy.nextRev, 500)).resolves.toMatchObject({ hasMore: false });
    await store.upkeep(new Date(now + 32 * 86400000));
    expect((await db.relayWorker.findUniqueOrThrow({ where: { id: 1 } })).prunedThroughRev).toBe(horizon);
  });
});
