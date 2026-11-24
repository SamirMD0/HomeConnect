import { createHash } from 'node:crypto';
import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ state: vi.fn(), user: vi.fn(), users: vi.fn(), branches: vi.fn(), relay: vi.fn() }));
vi.mock('../../../lib/prisma', () => ({ prisma: { syncWorkerState: { upsert: mocks.state }, user: { findFirst: mocks.user, findMany: mocks.users } } }));
vi.mock('../../branches/branches.service', () => ({ BranchesService: { accessibleBranches: mocks.branches } }));
vi.mock('./relay-client', async (original) => ({
  ...(await original<typeof import('./relay-client')>()),
  WorkerRelay: class { request = mocks.relay; },
}));
import { RelayFailure } from './relay-client';
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
  it.each(['ADMIN', 'EMPLOYEE'])('registers the current %s role and only the SHA-256 token hash', async role => {
    mocks.user.mockResolvedValue({ id: userId, fullName: 'Shop user', role });
    const response = await request(app).post('/worker/devices').set('Authorization', auth()).send({ userId, branchIds: [branchId], name: 'Counter phone' });
    expect(response.status).toBe(201);
    expect(response.headers['cache-control']).toBe('no-store');
    const qr = response.body.data;
    expect(qr).toEqual({ v: 1, relay: 'https://relay.example.com', deviceId: expect.any(String), token: expect.any(String), userId, userName: 'Shop user', role, branchIds: [branchId] });
    expect(Buffer.from(qr.token, 'base64url')).toHaveLength(32);
    expect(mocks.relay).toHaveBeenCalledWith('/devices', { id: qr.deviceId, userId, userName: 'Shop user', role, branchIds: [branchId], name: 'Counter phone', tokenSha256: createHash('sha256').update(qr.token).digest('hex') });
    expect(JSON.stringify(mocks.relay.mock.calls)).not.toContain(qr.token);
  });
  it('deletes a revoked phone and explains each case the relay refuses', async () => {
    const id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    const remove = () => request(app).post(`/worker/devices/${id}/delete`).set('Authorization', auth());
    mocks.relay.mockResolvedValueOnce({ id, deleted: true, actionsRemoved: 3 });
    expect((await remove()).body.data).toEqual({ id, deleted: true, actionsRemoved: 3 });
    expect(mocks.relay).toHaveBeenLastCalledWith(`/devices/${id}/delete`, {});
    mocks.relay.mockRejectedValueOnce(new RelayFailure(404, 'DEVICE_NOT_FOUND'));
    expect((await remove()).body.data).toEqual({ id, deleted: true, actionsRemoved: 0 });
    mocks.relay.mockRejectedValueOnce(new RelayFailure(409, 'DEVICE_HAS_WAITING_ACTIONS'));
    const waiting = await remove();
    expect(waiting.status).toBe(409);
    expect(waiting.body.error.message).toContain('still has actions waiting');
    mocks.relay.mockRejectedValueOnce(new RelayFailure(409, 'DEVICE_NOT_REVOKED'));
    expect((await remove()).body.error.message).toBe('Revoke this phone before deleting it.');
    mocks.relay.mockRejectedValueOnce(new RelayFailure(404, 'NOT_FOUND'));
    const outdated = await remove();
    expect(outdated.status).toBe(503);
    expect(outdated.body.error.code).toBe('RELAY_OUTDATED');
    expect((await request(app).post(`/worker/devices/${id}/delete`).set('Authorization', auth('EMPLOYEE'))).status).toBe(403);
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
