import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ readChanges: vi.fn(), branches: vi.fn() }));
vi.mock('./sync-feed.service', () => ({ readChanges: mocks.readChanges }));
vi.mock('../branches/branches.service', () => ({ BranchesService: { accessibleBranches: mocks.branches } }));
import { requireAuth } from '../../middleware/auth.middleware';
import { errorHandler } from '../../middleware/error.middleware';
import { syncRoutes } from './sync.routes';

const branchId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const app = express().use('/api/v1/sync', requireAuth, syncRoutes).use(errorHandler);
const auth = (role = 'ADMIN') => 'Bearer ' + jwt.sign({ userId: 'user', role }, process.env.JWT_SECRET!);

describe('PC sync inspection route', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.branches.mockResolvedValue([{ id: branchId }]);
    mocks.readChanges.mockResolvedValue({ records: [], nextSeq: '0', hasMore: false });
  });

  it('requires authentication and ADMIN before resolving branch access', async () => {
    expect((await request(app).get('/api/v1/sync/changes')).status).toBe(401);
    expect((await request(app).get('/api/v1/sync/changes').set('Authorization', auth('EMPLOYEE'))).status).toBe(403);
    expect(mocks.branches).not.toHaveBeenCalled();
    expect(mocks.readChanges).not.toHaveBeenCalled();
  });

  it('defaults to the initial cursor and maximum batch with the resolved scope', async () => {
    const response = await request(app).get('/api/v1/sync/changes').set('Authorization', auth());
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, data: { records: [], nextSeq: '0', hasMore: false } });
    expect(mocks.readChanges).toHaveBeenCalledWith(0n, 500, { mode: 'all', branchIds: [branchId] });
  });

  it('preserves large integer cursors and a selected branch', async () => {
    const response = await request(app).get('/api/v1/sync/changes?after=9007199254740993&limit=1')
      .set('Authorization', auth()).set('X-Branch-Scope', branchId);
    expect(response.status).toBe(200);
    expect(mocks.readChanges).toHaveBeenCalledWith(9007199254740993n, 1, { mode: 'single', branchIds: [branchId] });
  });

  it.each(['after=-1', 'after=1.5', 'after=1e3', 'after=', 'after=abc', 'after=9223372036854775808',
    'after=1&after=2', 'limit=0', 'limit=501', 'limit=1.5', 'limit=abc'])('rejects %s', async query => {
    expect((await request(app).get('/api/v1/sync/changes?' + query).set('Authorization', auth())).status).toBe(400);
    expect(mocks.readChanges).not.toHaveBeenCalled();
  });

  it('enforces branch access for an admin', async () => {
    const response = await request(app).get('/api/v1/sync/changes').set('Authorization', auth())
      .set('X-Branch-Scope', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
    expect(response.status).toBe(403);
    expect(mocks.readChanges).not.toHaveBeenCalled();
  });
});
