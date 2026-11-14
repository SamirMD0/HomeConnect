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
    const response = await request(makeApp()).get('/relay/v1/health');
    expect(response.body).toEqual({ ok: true });
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
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
    expect(store.readRecords).toHaveBeenCalledWith([branchId], '9007199254740993', 1);
    expect(store.touchDevice).not.toHaveBeenCalled();
  });

  it('refreshes device last_seen only after a minute', async () => {
    store.findDevice.mockResolvedValue({ ...paired, lastSeenAt: new Date(0) });
    await request(makeApp()).get('/relay/v1/device/records').set('Authorization', deviceAuth);
    expect(store.touchDevice).toHaveBeenCalledWith(id, expect.any(Date));
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
