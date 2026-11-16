import { createHash } from 'node:crypto';
import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ state: vi.fn(), user: vi.fn(), users: vi.fn(), branches: vi.fn(), relay: vi.fn() }));
vi.mock('../../../lib/prisma', () => ({ prisma: { syncWorkerState: { upsert: mocks.state }, user: { findFirst: mocks.user, findMany: mocks.users } } }));
vi.mock('../../branches/branches.service', () => ({ BranchesService: { accessibleBranches: mocks.branches } }));
vi.mock('./relay-client', () => ({ WorkerRelay: class { request = mocks.relay; } }));
import { workerRoutes } from './worker.routes';
import { encryptWorkerSecret } from './worker-secret';
import { requireAuth } from '../../../middleware/auth.middleware';
import { errorHandler } from '../../../middleware/error.middleware';
const app = express().use(express.json()).use('/worker', requireAuth, workerRoutes).use(errorHandler);
const userId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', branchId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const auth = (role = 'ADMIN') => 'Bearer ' + jwt.sign({ userId, role }, process.env.JWT_SECRET!);
describe('admin cloud phone pairing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.state.mockResolvedValue({ relayUrl: 'https://relay.example.com', workerSecretEncrypted: encryptWorkerSecret('worker-secret') });
    mocks.user.mockResolvedValue({ id: userId, fullName: 'Shop user', role: 'EMPLOYEE' });
    mocks.branches.mockResolvedValue([{ id: branchId, name: 'Main' }]);
    mocks.relay.mockResolvedValue([]);
  });
  it('returns a one-time QR and registers only the SHA-256 token hash', async () => {
    const response = await request(app).post('/worker/devices').set('Authorization', auth()).send({ userId, branchIds: [branchId], name: 'Counter phone' });
    expect(response.status).toBe(201);
    expect(response.headers['cache-control']).toBe('no-store');
    const qr = response.body.data;
    expect(qr).toEqual({ v: 1, relay: 'https://relay.example.com', deviceId: expect.any(String), token: expect.any(String), userId, userName: 'Shop user', branchIds: [branchId] });
    expect(Buffer.from(qr.token, 'base64url')).toHaveLength(32);
    expect(mocks.relay).toHaveBeenCalledWith('/devices', { id: qr.deviceId, userId, userName: 'Shop user', branchIds: [branchId], name: 'Counter phone', tokenSha256: createHash('sha256').update(qr.token).digest('hex') });
    expect(JSON.stringify(mocks.relay.mock.calls)).not.toContain(qr.token);
  });
  it('cannot pair branches outside the selected user grants', async () => {
    mocks.branches.mockResolvedValue([]);
    expect((await request(app).post('/worker/devices').set('Authorization', auth()).send({ userId, branchIds: [branchId], name: 'Phone' })).status).toBe(403);
    expect(mocks.relay).not.toHaveBeenCalled();
  });
  it('lists and revokes through the authenticated worker transport', async () => {
    expect((await request(app).get('/worker/devices').set('Authorization', auth())).status).toBe(200);
    expect((await request(app).post(`/worker/devices/${userId}/revoke`).set('Authorization', auth())).status).toBe(200);
    expect(mocks.relay).toHaveBeenCalledWith('/devices');
    expect(mocks.relay).toHaveBeenCalledWith(`/devices/${userId}/revoke`, {});
  });
  it('denies non-admin pairing, list, options and revocation before any relay call', async () => {
    for (const [method, path] of [['get', '/devices'], ['get', '/devices/options'], ['post', '/devices'], ['post', `/devices/${userId}/revoke`]] as const) {
      expect((await request(app)[method]('/worker' + path).set('Authorization', auth('EMPLOYEE')).send({})).status).toBe(403);
    }
    expect(mocks.state).not.toHaveBeenCalled();
    expect(mocks.relay).not.toHaveBeenCalled();
  });
});
