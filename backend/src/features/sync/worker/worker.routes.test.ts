import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ upsert: vi.fn(), update: vi.fn() }));
vi.mock('../../../lib/prisma', () => ({ prisma: { syncWorkerState: mocks } }));
import { requireAuth } from '../../../middleware/auth.middleware';
import { errorHandler } from '../../../middleware/error.middleware';
import { workerRoutes } from './worker.routes';
import { decryptWorkerSecret, encryptWorkerSecret } from './worker-secret';

const app = express().use(express.json()).use('/worker', requireAuth, workerRoutes).use(errorHandler);
const auth = (role = 'ADMIN') => 'Bearer ' + jwt.sign({ userId: 'user', role }, process.env.JWT_SECRET!);
const settings = { enabled: true, relayUrl: 'https://relay.example.com', openingStart: '07:00', openingEnd: '22:00' };
describe('worker settings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.upsert.mockResolvedValue({ ...settings, workerSecretEncrypted: 'private-ciphertext',
      openingStart: new Date('1970-01-01T07:00:00Z'), openingEnd: new Date('1970-01-01T22:00:00Z') });
    mocks.update.mockResolvedValue({});
  });
  it('never returns encrypted or plaintext secrets', async () => {
    const response = await request(app).get('/worker').set('Authorization', auth());
    expect(response.status).toBe(200);
    expect(response.body.data.secretConfigured).toBe(true);
    expect(JSON.stringify(response.body)).not.toMatch(/private-ciphertext|workerSecret/);
  });
  it('redacts database failures before passing them to HTTP error logging', async () => {
    mocks.upsert.mockRejectedValueOnce(new Error('private-ciphertext plaintext-secret'));
    const response = await request(app).get('/worker').set('Authorization', auth());
    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe('SYNC_SETTINGS_UNAVAILABLE');
    expect(JSON.stringify(response.body)).not.toMatch(/private-ciphertext|plaintext-secret/);
  });
  it.each(['http://example.com', 'https://user:password@example.com', 'https://example.com/?secret=bad'])('rejects unsafe relay address %s', async relayUrl => {
    expect((await request(app).put('/worker').set('Authorization', auth()).send({ ...settings, relayUrl })).status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it('encrypts a new secret and keeps it write-only', async () => {
    const response = await request(app).put('/worker').set('Authorization', auth()).send({ ...settings, workerSecret: 'very-private' });
    expect(response.status).toBe(200);
    const stored = mocks.update.mock.calls[0][0].data.workerSecretEncrypted;
    expect(stored).not.toContain('very-private');
    expect(decryptWorkerSecret(stored)).toBe('very-private');
    expect(JSON.stringify(response.body)).not.toContain('very-private');
    expect(encryptWorkerSecret('very-private')).not.toBe(stored);
  });
  it.each(['get', 'put', 'post'] as const)('denies employee %s before accessing state', async method => {
    expect((await request(app)[method](method === 'post' ? '/worker/run-now' : '/worker').set('Authorization', auth('EMPLOYEE')).send(settings)).status).toBe(403);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
});
