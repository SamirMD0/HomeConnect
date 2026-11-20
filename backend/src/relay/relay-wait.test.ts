import { createHash } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRelayApp } from './app';
import type { RelayStore } from './store';

const hash = (token: string) => createHash('sha256').update(token).digest('hex');
const workerSecret = 'worker-test-secret';
const deviceSecret = 'device-test-secret';
const id = '11111111-1111-4111-8111-111111111111';
const branchId = '22222222-2222-4222-8222-222222222222';
const paired = {
  id, userId: id, userName: 'Owner', role: 'EMPLOYEE', branchIds: [branchId], name: 'Phone',
  tokenSha256: hash(deviceSecret), lastSeenAt: new Date(), revokedAt: null, createdAt: new Date(),
};
const store = {
  findDevice: vi.fn(), touchDevice: vi.fn(), touchWorker: vi.fn(), upkeep: vi.fn(), countUsage: vi.fn(),
  enqueue: vi.fn(), putBlob: vi.fn(),
};
const log = vi.fn();
const workerAuth = 'Bearer ' + workerSecret;
const deviceAuth = 'Bearer ' + deviceSecret;
const makeApp = () =>
  createRelayApp({ store: store as unknown as RelayStore, workerTokenSha256: hash(workerSecret), log });
const action = { id, type: 'customer_payment.create', branchId, payload: { amount: '5' }, createdAt: new Date().toISOString() };

let servers: { close: () => void }[] = [];
async function listen(app: ReturnType<typeof makeApp>) {
  const server = app.listen(0);
  servers.push(server);
  await new Promise((resolve) => server.once('listening', resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}
const wait = (base: string, timeoutMs = 2000) =>
  fetch(`${base}/relay/v1/worker-wait?timeoutMs=${timeoutMs}`, { headers: { Authorization: workerAuth } });

describe('PC wake signal (no database while waiting)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    store.countUsage.mockResolvedValue(1);
    store.findDevice.mockImplementation(async (digest) => (digest === hash(deviceSecret) ? paired : null));
    store.enqueue.mockResolvedValue({ created: true, id, status: 'pending' });
  });
  afterEach(() => {
    for (const server of servers) server.close();
    servers = [];
  });

  it('accepts only the worker secret', async () => {
    const app = makeApp();
    for (const authorization of [undefined, 'Bearer wrong', deviceAuth]) {
      const call = request(app).get('/relay/v1/worker-wait');
      if (authorization) call.set('Authorization', authorization);
      expect((await call).status).toBe(401);
    }
  });

  it('answers at once after a restart, then waits without touching the database', async () => {
    const app = makeApp();
    const first = await request(app).get('/relay/v1/worker-wait?timeoutMs=1000').set('Authorization', workerAuth);
    expect(first.body).toEqual({ actions: true, refresh: false });
    const started = Date.now();
    const second = await request(app).get('/relay/v1/worker-wait?timeoutMs=1000').set('Authorization', workerAuth);
    expect(second.body).toEqual({ actions: false, refresh: false });
    expect(Date.now() - started).toBeGreaterThanOrEqual(900);
    for (const method of Object.values(store)) expect(method).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
  });

  it('wakes the waiting PC as soon as a phone sends an action', async () => {
    const base = await listen(makeApp());
    await (await wait(base)).json(); // clear the restart signal
    const started = Date.now();
    const waiting = wait(base, 20000);
    await new Promise((resolve) => setTimeout(resolve, 100));
    const sent = await fetch(`${base}/relay/v1/device/actions`, {
      method: 'POST',
      headers: { Authorization: deviceAuth, 'Content-Type': 'application/json' },
      body: JSON.stringify(action),
    });
    expect(sent.status).toBe(201);
    expect(await (await waiting).json()).toEqual({ actions: true, refresh: false });
    expect(Date.now() - started).toBeLessThan(5000);
  });

  it('passes a phone refresh request to the PC', async () => {
    const base = await listen(makeApp());
    await (await wait(base)).json();
    const waiting = wait(base, 20000);
    await new Promise((resolve) => setTimeout(resolve, 100));
    const refreshed = await fetch(`${base}/relay/v1/device/refresh`, {
      method: 'POST',
      headers: { Authorization: deviceAuth, 'Content-Type': 'application/json' },
      body: '{}',
    });
    expect(refreshed.status).toBe(200);
    expect(await (await waiting).json()).toEqual({ actions: false, refresh: true });
  });

  it('keeps the signal when the PC hangs up before it arrives', async () => {
    const base = await listen(makeApp());
    await (await wait(base)).json();
    const controller = new AbortController();
    const abandoned = fetch(`${base}/relay/v1/worker-wait?timeoutMs=20000`, {
      headers: { Authorization: workerAuth }, signal: controller.signal,
    }).catch(() => null);
    await new Promise((resolve) => setTimeout(resolve, 100));
    controller.abort();
    await abandoned;
    await new Promise((resolve) => setTimeout(resolve, 100));
    await fetch(`${base}/relay/v1/device/refresh`, {
      method: 'POST', headers: { Authorization: deviceAuth, 'Content-Type': 'application/json' }, body: '{}',
    });
    expect(await (await wait(base)).json()).toEqual({ actions: false, refresh: true });
  });

  it('refuses a refresh from an unpaired caller', async () => {
    const app = makeApp();
    expect((await request(app).post('/relay/v1/device/refresh').set('Authorization', workerAuth).send({})).status).toBe(401);
    expect((await request(app).post('/relay/v1/device/refresh').send({})).status).toBe(401);
  });
});
