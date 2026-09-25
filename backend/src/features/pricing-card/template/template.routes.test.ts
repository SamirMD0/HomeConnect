import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '../../../app';
import { minimumTemplateConfig } from './pricing-card-template-config.fixture';

const { service } = vi.hoisted(() => ({ service: { listTemplates: vi.fn(), getTemplate: vi.fn(), createTemplate: vi.fn(), updateTemplate: vi.fn(), archiveTemplate: vi.fn() } }));
vi.mock('./template.service', () => ({ PricingCardTemplateService: service }));
vi.mock('../../../lib/prisma', () => ({ prisma: { $queryRaw: vi.fn().mockResolvedValue([{ result: 1 }]) }, transactionModel: {}, activityLogModel: {} }));

const secret = process.env.JWT_SECRET || 'fallback_secret_key_change_in_production';
const admin = jwt.sign({ userId: '11111111-1111-4111-8111-111111111111', role: 'ADMIN' }, secret);
const employee = jwt.sign({ userId: '22222222-2222-4222-8222-222222222222', role: 'EMPLOYEE' }, secret);
const templateId = '20000000-0000-4000-8000-000000000001';
const input = { name: 'TV Large Card', paperMode: 'SINGLE_STICKER', paperSize: null, cardWidthMm: 148, cardHeightMm: 105, config: minimumTemplateConfig, featureMax: 6, specKeyOrder: ['screen_size'], defaultValidityDays: 30 };

describe('pricing card template routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    service.listTemplates.mockResolvedValue(Array.from({ length: 4 }, (_, i) => ({ id: `${i}` })));
    service.getTemplate.mockResolvedValue({ id: templateId });
    service.createTemplate.mockResolvedValue({ id: templateId });
    service.updateTemplate.mockResolvedValue({ id: templateId });
    service.archiveTemplate.mockResolvedValue({ id: templateId, isActive: false });
  });

  it('requires authentication and exposes four seeded templates to staff', async () => {
    expect((await request(app).get('/api/v1/pricing-card-templates')).status).toBe(401);
    const response = await request(app).get('/api/v1/pricing-card-templates').set('Authorization', `Bearer ${employee}`);
    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(4);
  });

  it('requires admin role for CRUD mutations', async () => {
    expect((await request(app).post('/api/v1/pricing-card-templates').set('Authorization', `Bearer ${employee}`).send(input)).status).toBe(403);
    expect((await request(app).post('/api/v1/pricing-card-templates').set('Authorization', `Bearer ${admin}`).send(input)).status).toBe(201);
    expect((await request(app).patch(`/api/v1/pricing-card-templates/${templateId}`).set('Authorization', `Bearer ${admin}`).send(input)).status).toBe(200);
    expect((await request(app).post(`/api/v1/pricing-card-templates/${templateId}/archive`).set('Authorization', `Bearer ${admin}`).send({})).status).toBe(200);
  });

  it('returns a structured 400 for malformed config', async () => {
    const response = await request(app).post('/api/v1/pricing-card-templates').set('Authorization', `Bearer ${admin}`).send({ ...input, config: { nope: true } });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });
});
