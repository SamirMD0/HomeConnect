import { createHash } from 'node:crypto';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRelayApp } from './app';
import { RelayError } from './errors';
import { MAX_BLOB_BYTES } from './inputs';
import type { RelayStore } from './store';

const hash = (token: string) => createHash('sha256').update(token).digest('hex');
const workerSecret = 'worker-test-secret';
const deviceSecret = 'device-test-secret';
const id = '11111111-1111-4111-8111-111111111111';
const branchId = '22222222-2222-4222-8222-222222222222';
const otherBranch = '33333333-3333-4333-8333-333333333333';
const paired = { id, userId: otherBranch, userName: 'Owner', branchIds: [branchId], name: 'Phone',
  tokenSha256: hash(deviceSecret), lastSeenAt: new Date(), revokedAt: null, createdAt: new Date() };
const action = { id, type: 'take_payment', branchId, payload: { amount: '19.99' }, createdAt: new Date().toISOString() };
const store = {
  findDevice: vi.fn(), touchDevice: vi.fn(), touchWorker: vi.fn(), upkeep: vi.fn(), countUsage: vi.fn(),
  writeRecords: vi.fn(), workerState: vi.fn(), claim: vi.fn(), getBlob: vi.fn(), saveResult: vi.fn(),
  registerDevice: vi.fn(), revokeDevice: vi.fn(), devices: vi.fn(), usage: vi.fn(),
  readRecords: vi.fn(), enqueue: vi.fn(), putBlob: vi.fn(), actionResults: vi.fn(),
};
const log = vi.fn();
const makeApp = (now?: () => number) => createRelayApp({ store: store as unknown as RelayStore,
  workerTokenSha256: hash(workerSecret), log, now });
const workerAuth = 'Bearer ' + workerSecret;
const deviceAuth = 'Bearer ' + deviceSecret;

describe('isolated relay routes', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    store.countUsage.mockResolvedValue(1);
    store.upkeep.mockResolvedValue(true);
    store.findDevice.mockImplementation(async digest => digest === hash(deviceSecret) ? paired : null);
    store.readRecords.mockResolvedValue({ records: [], nextRev: '0', hasMore: false });
    store.enqueue.mockResolvedValue({ created: true, id, status: 'pending' });
  });

  it('serves health with no database calls or CORS headers', async () => {
    const app = makeApp();
    const response = await request(app).get('/relay/v1/health');
    expect(response.body).toEqual({ ok: true });
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
    expect((await request(app).get('/relay/v1/health/')).status).toBe(200);
    expect((await request(app).head('/relay/v1/health')).status).toBe(200);
    for (const method of Object.values(store)) expect(method).not.toHaveBeenCalled();
  });

  it.each([undefined, 'Bearer wrong', deviceAuth])('rejects worker authentication %s', async authorization => {
    const call = request(makeApp()).get('/relay/v1/worker/state');
    if (authorization) call.set('Authorization', authorization);
    expect((await call).status).toBe(401);
    expect(store.workerState).not.toHaveBeenCalled();
  });

  it.each([undefined, 'Bearer wrong', workerAuth])('rejects device authentication %s', async authorization => {
    const call = request(makeApp()).get('/relay/v1/device/records');
    if (authorization) call.set('Authorization', authorization);
    expect((await call).status).toBe(401);
    expect(store.readRecords).not.toHaveBeenCalled();
  });

  it('refuses a revoked device with its specific code', async () => {
    store.findDevice.mockResolvedValue({ ...paired, revokedAt: new Date() });
    const response = await request(makeApp()).get('/relay/v1/device/records').set('Authorization', deviceAuth);
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('DEVICE_REVOKED');
  });

  it('scopes records to stored device branches and preserves bigint cursors', async () => {
    const response = await request(makeApp()).get('/relay/v1/device/records?after=9007199254740993&limit=1&branchId=' + otherBranch)
      .set('Authorization', deviceAuth);
    expect(response.status).toBe(200);
    expect(store.readRecords).toHaveBeenCalledWith([branchId], '9007199254740993', 1, undefined);
    expect(store.touchDevice).not.toHaveBeenCalled();
  });

  it('refreshes device last_seen only after a minute', async () => {
    store.findDevice.mockResolvedValue({ ...paired, lastSeenAt: new Date(0) });
    await request(makeApp()).get('/relay/v1/device/records').set('Authorization', deviceAuth);
    expect(store.touchDevice).toHaveBeenCalledWith(id, expect.any(Date));
  });

  it('normalizes UUID casing before device branch comparisons', async () => {
    const namedBranch = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    store.findDevice.mockResolvedValue({ ...paired, branchIds: [namedBranch] });
    expect((await request(makeApp()).post('/relay/v1/device/actions').set('Authorization', deviceAuth)
      .send({ ...action, branchId: namedBranch.toUpperCase() })).status).toBe(201);
    expect(store.enqueue).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ branchId: namedBranch }));
  });

  it('passes opaque records and tombstones to the worker transaction', async () => {
    store.writeRecords.mockResolvedValue({ stored: 2, lastPcSeq: '42' });
    const body = { pcSeq: '42', records: [
      { entity: 'product', id, branchId: null, op: 'upsert', data: { price: 'opaque arbitrary value' } },
      { entity: 'customer', id, branchId, op: 'delete' },
    ] };
    expect((await request(makeApp()).post('/relay/v1/worker/records').set('Authorization', workerAuth).send(body)).body)
      .toEqual({ stored: 2, lastPcSeq: '42' });
    expect(store.writeRecords).toHaveBeenCalledWith(body);
  });

  it('uses the paired user and denies an action outside its branches', async () => {
    const app = makeApp();
    expect((await request(app).post('/relay/v1/device/actions').set('Authorization', deviceAuth)
      .send({ ...action, branchId: otherBranch })).status).toBe(403);
    expect(store.enqueue).not.toHaveBeenCalled();
    const response = await request(app).post('/relay/v1/device/actions').set('Authorization', deviceAuth)
      .send({ ...action, userId: 'forged-user' });
    expect(response.status).toBe(201);
    expect(store.enqueue).toHaveBeenCalledWith(paired, action);
  });

  it('returns the existing action status on replay and conflicts across devices', async () => {
    const app = makeApp();
    store.enqueue.mockResolvedValueOnce({ created: false, id, status: 'applied' });
    const replay = await request(app).post('/relay/v1/device/actions').set('Authorization', deviceAuth).send(action);
    expect(replay.status).toBe(200);
    expect(replay.body).toEqual({ id, status: 'applied' });
    store.enqueue.mockRejectedValueOnce(new RelayError(409, 'ACTION_ID_CONFLICT', 'Action ID belongs to another device.'));
    expect((await request(app).post('/relay/v1/device/actions').set('Authorization', deviceAuth).send(action)).status).toBe(409);
  });

  it('accepts a photo declaration and exposes awaiting_photo to the device', async () => {
    const app = makeApp();
    const body = { ...action, photo: { mime: 'image/png', size: 100 } };
    store.enqueue.mockResolvedValue({ created: true, id, status: 'awaiting_photo' });
    const response = await request(app).post('/relay/v1/device/actions').set('Authorization', deviceAuth).send(body);
    expect(response.status).toBe(201);
    expect(response.body.status).toBe('awaiting_photo');
    expect(store.enqueue).toHaveBeenCalledWith(paired, body);
    store.actionResults.mockResolvedValue([{ id, status: 'awaiting_photo', result: null }]);
    expect((await request(app).get('/relay/v1/device/actions?ids=' + id).set('Authorization', deviceAuth)).body)
      .toEqual([{ id, status: 'awaiting_photo', result: null }]);
  });

  it.each([{ mime: 'image/gif', size: 100 }, { mime: 'image/png', size: 2097153 }, { mime: 'image/png', size: 0 }])(
    'rejects invalid photo declarations %j', async photo => {
      expect((await request(makeApp()).post('/relay/v1/device/actions').set('Authorization', deviceAuth).send({ ...action, photo })).status).toBe(400);
      expect(store.enqueue).not.toHaveBeenCalled();
    }
  );

  it('returns the resync-required response for a cursor below the pruning horizon', async () => {
    store.readRecords.mockRejectedValue(new RelayError(410, 'RESYNC_REQUIRED', 'Start a full copy.'));
    const response = await request(makeApp()).get('/relay/v1/device/records?after=5').set('Authorization', deviceAuth);
    expect(response.status).toBe(410);
    expect(response.body).toEqual({ code: 'RESYNC_REQUIRED' });
  });

  it('starts a full copy and carries its snapshot horizon on continuation pages', async () => {
    const app = makeApp();
    store.readRecords.mockResolvedValue({ records: [], nextRev: '3', hasMore: true, snapshotHorizon: '100' });
    const first = await request(app).get('/relay/v1/device/records?after=0&fullCopy=true&limit=1').set('Authorization', deviceAuth);
    expect(first.status).toBe(200);
    expect(first.body.snapshotHorizon).toBe('100');
    expect(store.readRecords).toHaveBeenLastCalledWith([branchId], '0', 1, { fullCopy: true, snapshotHorizon: undefined });
    const next = await request(app).get('/relay/v1/device/records?after=3&fullCopy=true&snapshotHorizon=100&limit=1').set('Authorization', deviceAuth);
    expect(next.status).toBe(200);
    expect(store.readRecords).toHaveBeenLastCalledWith([branchId], '3', 1, { fullCopy: true, snapshotHorizon: '100' });
  });

  it.each(['after=1&fullCopy=true', 'snapshotHorizon=1', 'fullCopy=invalid', 'after=1&fullCopy=true&snapshotHorizon=-1'])(
    'rejects invalid full-copy parameters %s', async query => {
      expect((await request(makeApp()).get('/relay/v1/device/records?' + query).set('Authorization', deviceAuth)).status).toBe(400);
      expect(store.readRecords).not.toHaveBeenCalled();
    }
  );

  it('polls only the authenticated device actions', async () => {
    store.actionResults.mockResolvedValue([{ id, status: 'applied', result: { receiptId: id } }]);
    const response = await request(makeApp()).get('/relay/v1/device/actions?ids=' + id).set('Authorization', deviceAuth);
    expect(response.status).toBe(200);
    expect(store.actionResults).toHaveBeenCalledWith(paired.id, [id]);
  });

  it('validates batch and action payload size before storage', async () => {
    const app = makeApp();
    const records = Array.from({ length: 501 }, () => ({ entity: 'product', id, branchId: null, op: 'delete' }));
    expect((await request(app).post('/relay/v1/worker/records').set('Authorization', workerAuth).send({ pcSeq: '1', records })).status).toBe(400);
    expect((await request(app).post('/relay/v1/device/actions').set('Authorization', deviceAuth)
      .send({ ...action, payload: 'x'.repeat(256 * 1024) })).status).toBe(400);
    expect((await request(app).post('/relay/v1/worker/records').set('Authorization', workerAuth)
      .send({ pcSeq: '1', records: [], padding: 'x'.repeat(MAX_BLOB_BYTES) })).status).toBe(413);
    expect(store.writeRecords).not.toHaveBeenCalled();
    expect(store.enqueue).not.toHaveBeenCalled();
  });

  it('accepts at most a 2 MB supported image for a pending owned action', async () => {
    const app = makeApp();
    store.putBlob.mockResolvedValue({ id, size: MAX_BLOB_BYTES });
    expect((await request(app).put(`/relay/v1/device/actions/${id}/blob`).set('Authorization', deviceAuth)
      .set('Content-Type', 'image/png').send(Buffer.alloc(MAX_BLOB_BYTES))).status).toBe(200);
    expect(store.putBlob).toHaveBeenCalledWith(paired.id, id, 'image/png', expect.any(Buffer));
    expect((await request(app).put(`/relay/v1/device/actions/${id}/blob`).set('Authorization', deviceAuth)
      .set('Content-Type', 'image/png').send(Buffer.alloc(MAX_BLOB_BYTES + 1))).status).toBe(413);
    expect((await request(app).put(`/relay/v1/device/actions/${id}/blob`).set('Authorization', deviceAuth)
      .set('Content-Type', 'application/octet-stream').send(Buffer.from('image'))).status).toBe(415);
    expect((await request(app).put(`/relay/v1/device/actions/${id}/blob`).set('Authorization', deviceAuth)
      .set('Content-Type', 'image/png').send(Buffer.alloc(0))).status).toBe(400);
    store.putBlob.mockRejectedValue(new RelayError(409, 'ACTION_NOT_PENDING', 'Action was claimed.'));
    expect((await request(app).put(`/relay/v1/device/actions/${id}/blob`).set('Authorization', deviceAuth)
      .set('Content-Type', 'image/png').send(Buffer.from('image'))).status).toBe(409);
  });

  it('hands photos to the worker as raw bytes and rejects final-status changes', async () => {
    const app = makeApp();
    store.getBlob.mockResolvedValue({ mime: 'image/png', bytes: Buffer.from([1, 2, 3]) });
    const image = await request(app).get(`/relay/v1/worker/outbox/${id}/blob`).set('Authorization', workerAuth);
    expect(image.headers['content-type']).toContain('image/png');
    expect(image.body).toEqual(Buffer.from([1, 2, 3]));
    store.saveResult.mockResolvedValueOnce({ id, status: 'applied', result: {} });
    expect((await request(app).post(`/relay/v1/worker/outbox/${id}/result`).set('Authorization', workerAuth)
      .send({ status: 'applied', result: {} })).status).toBe(200);
    store.saveResult.mockRejectedValueOnce(new RelayError(409, 'RESULT_CONFLICT', 'Different final status.'));
    expect((await request(app).post(`/relay/v1/worker/outbox/${id}/result`).set('Authorization', workerAuth)
      .send({ status: 'refused', result: {} })).status).toBe(409);
  });

  it('registers, lists and revokes devices, reads state/usage, and claims bounded batches', async () => {
    const app = makeApp();
    const registration = { id, userId: paired.userId, userName: paired.userName, branchIds: paired.branchIds,
      name: paired.name, tokenSha256: paired.tokenSha256 };
    store.registerDevice.mockResolvedValue({ id });
    store.devices.mockResolvedValue([{ id, name: 'Phone' }]);
    store.revokeDevice.mockResolvedValue({ id, revoked: true });
    store.workerState.mockResolvedValue({ lastPcSeq: '55', lastSeenAt: null });
    store.usage.mockResolvedValue({ days: [], totals: { bytesIn: 9007199254740993n } });
    store.claim.mockResolvedValue([{ id, hasBlob: true }]);
    expect((await request(app).post('/relay/v1/worker/devices').set('Authorization', workerAuth).send(registration)).status).toBe(200);
    expect(store.registerDevice).toHaveBeenCalledWith(registration);
    expect((await request(app).get('/relay/v1/worker/devices').set('Authorization', workerAuth)).body).toEqual([{ id, name: 'Phone' }]);
    expect((await request(app).post(`/relay/v1/worker/devices/${id}/revoke`).set('Authorization', workerAuth)).status).toBe(200);
    expect((await request(app).get('/relay/v1/worker/state').set('Authorization', workerAuth)).body.lastPcSeq).toBe('55');
    expect((await request(app).get('/relay/v1/worker/usage').set('Authorization', workerAuth)).body.totals.bytesIn).toBe('9007199254740993');
    expect((await request(app).post('/relay/v1/worker/outbox/claim').set('Authorization', workerAuth).send({ limit: 50 })).body)
      .toEqual([{ id, hasBlob: true }]);
    expect((await request(app).post('/relay/v1/worker/outbox/claim').set('Authorization', workerAuth).send({ limit: 51 })).status).toBe(400);
    expect((await request(app).post('/relay/v1/worker/devices').set('Authorization', workerAuth)
      .send({ ...registration, tokenSha256: hash(workerSecret) })).status).toBe(400);
    expect(store.upkeep).toHaveBeenCalledTimes(1);
    expect(store.countUsage).toHaveBeenCalledWith(expect.objectContaining({ recordsWritten: 0, actionsReceived: 0 }));
  });

  it('accounts accepted record/action writes without counting duplicate actions again', async () => {
    const app = makeApp();
    store.writeRecords.mockResolvedValue({ stored: 1, lastPcSeq: '1' });
    await request(app).post('/relay/v1/worker/records').set('Authorization', workerAuth)
      .send({ pcSeq: '1', records: [{ entity: 'x', id, branchId: null, op: 'delete' }] });
    expect(store.countUsage).toHaveBeenLastCalledWith(expect.objectContaining({ recordsWritten: 1, actionsReceived: 0 }));
    await request(app).post('/relay/v1/device/actions').set('Authorization', deviceAuth).send(action);
    expect(store.countUsage).toHaveBeenLastCalledWith(expect.objectContaining({ recordsWritten: 0, actionsReceived: 1 }));
    store.enqueue.mockResolvedValue({ created: false, id, status: 'pending' });
    await request(app).post('/relay/v1/device/actions').set('Authorization', deviceAuth).send(action);
    expect(store.countUsage).toHaveBeenLastCalledWith(expect.objectContaining({ recordsWritten: 0, actionsReceived: 0 }));
  });

  it('logs only request metadata even for invalid JSON or database errors', async () => {
    const app = makeApp();
    store.writeRecords.mockRejectedValue(new Error('private payload secret'));
    await request(app).post('/relay/v1/worker/records?secret=hidden').set('Authorization', workerAuth)
      .send({ pcSeq: '1', records: [{ entity: 'x', id, branchId: null, op: 'upsert', data: { secret: 'private payload' } }] });
    await request(app).post('/relay/v1/worker/records').set('Authorization', workerAuth).set('Content-Type', 'application/json').send('{secret');
    expect(log).toHaveBeenCalled();
    for (const [entry] of log.mock.calls) expect(Object.keys(entry).sort()).toEqual(['method', 'ms', 'path', 'status']);
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/private|hidden|worker-test-secret|device-test-secret/);
  });

  it('rate limits devices and workers separately and retries after a minute', async () => {
    let time = Date.now();
    const app = makeApp(() => time);
    for (let count = 0; count < 120; count++) {
      expect((await request(app).get('/relay/v1/device/records').set('Authorization', deviceAuth)).status).toBe(200);
    }
    expect((await request(app).get('/relay/v1/device/records').set('Authorization', deviceAuth)).status).toBe(429);
    store.workerState.mockResolvedValue({ lastPcSeq: '0', lastSeenAt: null });
    expect((await request(app).get('/relay/v1/worker/state').set('Authorization', workerAuth)).status).toBe(200);
    for (let count = 1; count < 120; count++) {
      expect((await request(app).get('/relay/v1/worker/state').set('Authorization', workerAuth)).status).toBe(200);
    }
    expect((await request(app).get('/relay/v1/worker/state').set('Authorization', workerAuth)).status).toBe(429);
    time += 60000;
    expect((await request(app).get('/relay/v1/device/records').set('Authorization', deviceAuth)).status).toBe(200);
    expect(store.upkeep).toHaveBeenCalledTimes(1);
  });

  it.each(['after=-1', 'limit=501', 'after=9223372036854775808', 'limit=1.5'])(
    'rejects invalid record pagination %s', async query => {
      expect((await request(makeApp()).get('/relay/v1/device/records?' + query).set('Authorization', deviceAuth)).status).toBe(400);
    }
  );
});
