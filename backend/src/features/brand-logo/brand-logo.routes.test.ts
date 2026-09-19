import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '../../app';

const { service } = vi.hoisted(() => ({ service: {
  listBrandLogos: vi.fn(), createBrandLogo: vi.fn(), updateBrandLogo: vi.fn(), archiveBrandLogo: vi.fn(),
} }));
vi.mock('./brand-logo.service', () => ({ BrandLogoService: service }));
vi.mock('../../lib/prisma', () => ({ prisma: { $queryRaw: vi.fn().mockResolvedValue([{ result: 1 }]) }, transactionModel: {}, activityLogModel: {} }));

const secret = process.env.JWT_SECRET || 'fallback_secret_key_change_in_production';
const admin = jwt.sign({ userId: '11111111-1111-4111-8111-111111111111', role: 'ADMIN' }, secret);
const employee = jwt.sign({ userId: '22222222-2222-4222-8222-222222222222', role: 'EMPLOYEE' }, secret);
const brandLogoId = '33333333-3333-4333-8333-333333333333';
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).toString('base64');

describe('brand logo routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    service.listBrandLogos.mockResolvedValue([]);
    service.createBrandLogo.mockResolvedValue({ id: brandLogoId, canonicalName: 'samsung', displayName: 'Samsung' });
    service.updateBrandLogo.mockResolvedValue({ id: brandLogoId, displayName: 'SAMSUNG' });
    service.archiveBrandLogo.mockResolvedValue({ id: brandLogoId, isActive: false });
  });

  it('requires authentication and permits staff reads', async () => {
    expect((await request(app).get('/api/v1/brand-logos')).status).toBe(401);
    expect((await request(app).get('/api/v1/brand-logos').set('Authorization', `Bearer ${employee}`)).status).toBe(200);
  });

  it('requires admin role and password for create, update, and archive', async () => {
    const create = { displayName: 'Samsung', dataBase64: png, mimeType: 'image/png', accountPassword: 'secret' };
    expect((await request(app).post('/api/v1/brand-logos').set('Authorization', `Bearer ${employee}`).send(create)).status).toBe(403);
    expect((await request(app).post('/api/v1/brand-logos').set('Authorization', `Bearer ${admin}`).send({ ...create, accountPassword: undefined })).status).toBe(401);
    expect((await request(app).post('/api/v1/brand-logos').set('Authorization', `Bearer ${admin}`).send(create)).status).toBe(201);

    expect((await request(app).patch(`/api/v1/brand-logos/${brandLogoId}`).set('Authorization', `Bearer ${admin}`).send({ ...create, displayName: 'SAMSUNG' })).status).toBe(200);
    expect((await request(app).post(`/api/v1/brand-logos/${brandLogoId}/archive`).set('Authorization', `Bearer ${admin}`).send({ accountPassword: 'secret' })).status).toBe(200);
  });

  it('rejects SVG and malformed raster payloads at validation/service boundaries', async () => {
    const svg = Buffer.from('<svg/>').toString('base64');
    expect((await request(app).post('/api/v1/brand-logos').set('Authorization', `Bearer ${admin}`).send({ displayName: 'Unsafe', dataBase64: svg, mimeType: 'image/svg+xml', accountPassword: 'secret' })).status).toBe(400);
  });
});
