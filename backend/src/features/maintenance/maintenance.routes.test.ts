import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '../../app';

const { service } = vi.hoisted(() => ({ service: { overview: vi.fn(), applyPendingChanges: vi.fn() } }));
vi.mock('./maintenance.service', () => ({ MaintenanceService: service }));
vi.mock('../../lib/prisma', () => ({
  prisma: { $queryRaw: vi.fn().mockResolvedValue([{ result: 1 }]) },
  transactionModel: {},
  activityLogModel: {},
}));

const secret = process.env.JWT_SECRET || 'fallback_secret_key_change_in_production';
const admin = jwt.sign({ userId: '11111111-1111-4111-8111-111111111111', role: 'ADMIN' }, secret);
const employee = jwt.sign({ userId: '22222222-2222-4222-8222-222222222222', role: 'EMPLOYEE' }, secret);

const overview = {
  appVersion: '1.2.0',
  toolsAvailable: true,
  blockedReason: null,
  migrations: { pending: [], failed: [], mismatched: [], databaseIsNewer: false },
  pendingRepairs: [],
  registryProblems: [],
  history: [],
};

const credentials = { accountPassword: 'pass', confirmation: 'APPLY' };

describe('maintenance routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    service.overview.mockResolvedValue(overview);
    service.applyPendingChanges.mockResolvedValue([]);
  });

  it('requires authentication', async () => {
    expect((await request(app).get('/api/v1/admin/maintenance')).status).toBe(401);
    expect((await request(app).post('/api/v1/admin/maintenance/apply').send(credentials)).status).toBe(401);
  });

  it('refuses non-admins on both read and write', async () => {
    expect((await request(app).get('/api/v1/admin/maintenance').set('Authorization', `Bearer ${employee}`)).status).toBe(403);

    const apply = await request(app)
      .post('/api/v1/admin/maintenance/apply')
      .set('Authorization', `Bearer ${employee}`)
      .send(credentials);
    expect(apply.status).toBe(403);
    expect(service.applyPendingChanges).not.toHaveBeenCalled();
  });

  it('returns the overview to an admin', async () => {
    const response = await request(app).get('/api/v1/admin/maintenance').set('Authorization', `Bearer ${admin}`);
    expect(response.status).toBe(200);
    expect(response.body.data.appVersion).toBe('1.2.0');
  });

  it('will not apply without the account password', async () => {
    const response = await request(app)
      .post('/api/v1/admin/maintenance/apply')
      .set('Authorization', `Bearer ${admin}`)
      .send({ confirmation: 'APPLY' });
    expect(response.status).toBe(400);
    expect(service.applyPendingChanges).not.toHaveBeenCalled();
  });

  /** A destructive-sounding action must not be reachable by a stray click. */
  it('will not apply without the typed confirmation', async () => {
    const response = await request(app)
      .post('/api/v1/admin/maintenance/apply')
      .set('Authorization', `Bearer ${admin}`)
      .send({ accountPassword: 'pass', confirmation: 'yes' });
    expect(response.status).toBe(400);
    expect(service.applyPendingChanges).not.toHaveBeenCalled();
  });

  it('applies for an admin with both, and passes the caller identity through', async () => {
    const response = await request(app)
      .post('/api/v1/admin/maintenance/apply')
      .set('Authorization', `Bearer ${admin}`)
      .send(credentials);

    expect(response.status).toBe(200);
    expect(service.applyPendingChanges).toHaveBeenCalledWith(
      expect.objectContaining({ userId: '11111111-1111-4111-8111-111111111111', accountPassword: 'pass' })
    );
  });

  it('never echoes the submitted password back', async () => {
    const response = await request(app)
      .post('/api/v1/admin/maintenance/apply')
      .set('Authorization', `Bearer ${admin}`)
      .send(credentials);
    expect(JSON.stringify(response.body)).not.toContain('pass');
  });
});
