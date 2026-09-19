import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '../../../app';

const { service } = vi.hoisted(() => ({ service: {
  listFeatureIcons: vi.fn(), createFeatureIcon: vi.fn(), updateFeatureIcon: vi.fn(), archiveFeatureIcon: vi.fn(),
} }));
vi.mock('./feature-icon.service', () => ({ FeatureIconService: service }));
vi.mock('../../../lib/prisma', () => ({ prisma: { $queryRaw: vi.fn().mockResolvedValue([{ result: 1 }]) }, transactionModel: {}, activityLogModel: {} }));

const secret = process.env.JWT_SECRET || 'fallback_secret_key_change_in_production';
const admin = jwt.sign({ userId: '11111111-1111-4111-8111-111111111111', role: 'ADMIN' }, secret);
const employee = jwt.sign({ userId: '22222222-2222-4222-8222-222222222222', role: 'EMPLOYEE' }, secret);
const iconId = '10000000-0000-4000-8000-000000000001';
const input = { code: 'qled', label: 'QLED', category: 'tv', svg: '<svg viewBox="0 0 24 24"><path d="M1 1h2v2z"/></svg>', sortOrder: 1, isActive: true, accountPassword: 'secret' };

describe('feature icon routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    service.listFeatureIcons.mockResolvedValue(Array.from({ length: 17 }, (_, index) => ({ id: `${index}`, code: `icon-${index}` })));
    service.createFeatureIcon.mockResolvedValue({ id: iconId, code: 'qled' });
    service.updateFeatureIcon.mockResolvedValue({ id: iconId, code: 'qled' });
    service.archiveFeatureIcon.mockResolvedValue({ id: iconId, isActive: false });
  });

  it('requires authentication and lists the 17 seeded icons for staff', async () => {
    expect((await request(app).get('/api/v1/pricing-card-feature-icons')).status).toBe(401);
    const response = await request(app).get('/api/v1/pricing-card-feature-icons').set('Authorization', `Bearer ${employee}`);
    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(17);
  });

  it('requires admin role and account password for every mutation', async () => {
    expect((await request(app).post('/api/v1/pricing-card-feature-icons').set('Authorization', `Bearer ${employee}`).send(input)).status).toBe(403);
    expect((await request(app).post('/api/v1/pricing-card-feature-icons').set('Authorization', `Bearer ${admin}`).send({ ...input, accountPassword: undefined })).status).toBe(401);
    expect((await request(app).post('/api/v1/pricing-card-feature-icons').set('Authorization', `Bearer ${admin}`).send(input)).status).toBe(201);
    expect((await request(app).patch(`/api/v1/pricing-card-feature-icons/${iconId}`).set('Authorization', `Bearer ${admin}`).send(input)).status).toBe(200);
    expect((await request(app).post(`/api/v1/pricing-card-feature-icons/${iconId}/archive`).set('Authorization', `Bearer ${admin}`).send({ accountPassword: 'secret' })).status).toBe(200);
  });

  it('rejects a script-bearing SVG before service dispatch', async () => {
    const response = await request(app).post('/api/v1/pricing-card-feature-icons').set('Authorization', `Bearer ${admin}`).send({ ...input, svg: '<svg><script>alert(1)</script></svg>' });
    expect(response.status).toBe(400);
  });
});
