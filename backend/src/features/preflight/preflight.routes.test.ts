import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '../../app';

const { service } = vi.hoisted(() => ({ service: { run: vi.fn() } }));
vi.mock('./preflight.service', () => ({ PreflightService: service }));
vi.mock('../../lib/prisma', () => ({
  prisma: { $queryRaw: vi.fn().mockResolvedValue([{ result: 1 }]) },
  transactionModel: {},
  activityLogModel: {},
}));

const secret = process.env.JWT_SECRET || 'fallback_secret_key_change_in_production';
const admin = jwt.sign({ userId: '11111111-1111-4111-8111-111111111111', role: 'ADMIN' }, secret);
const employee = jwt.sign({ userId: '22222222-2222-4222-8222-222222222222', role: 'EMPLOYEE' }, secret);

const report = {
  status: 'FAIL',
  canStart: false,
  checkedAt: '2026-08-04T00:00:00.000Z',
  appVersion: '1.2.0',
  checks: [{ id: 'ENV_FILE', title: 'Configuration file', status: 'FAIL', detail: 'missing', fix: 'Run the setup script.' }],
};

describe('preflight routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    service.run.mockResolvedValue(report);
  });

  it('requires authentication', async () => {
    expect((await request(app).get('/api/v1/admin/preflight')).status).toBe(401);
  });

  it('refuses non-admins', async () => {
    const response = await request(app).get('/api/v1/admin/preflight').set('Authorization', `Bearer ${employee}`);
    expect(response.status).toBe(403);
    expect(service.run).not.toHaveBeenCalled();
  });

  it('returns the report to an admin', async () => {
    const response = await request(app).get('/api/v1/admin/preflight').set('Authorization', `Bearer ${admin}`);
    expect(response.status).toBe(200);
    expect(response.body.data.checks[0].id).toBe('ENV_FILE');
    expect(service.run).toHaveBeenCalledTimes(1);
  });

  /**
   * A failing report is a successful diagnosis. Returning 4xx/5xx would make the
   * UI show a generic error instead of the checklist it just produced.
   */
  it('answers 200 even when checks fail', async () => {
    const response = await request(app).get('/api/v1/admin/preflight').set('Authorization', `Bearer ${admin}`);
    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('FAIL');
    expect(response.body.data.canStart).toBe(false);
  });
});
