import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '../../../app';

const { service, configService } = vi.hoisted(() => ({ service: {
  list: vi.fn(), get: vi.fn(), create: vi.fn(), update: vi.fn(),
  archive: vi.fn(), restore: vi.fn(), setDefault: vi.fn(), setLabelSecret: vi.fn(), clearLabelSecret: vi.fn(), audit: vi.fn(),
}, configService: { get: vi.fn(), updateSettings: vi.fn(), createEncoding: vi.fn(), updateEncoding: vi.fn() } }));
vi.mock('./pricing-presets.service', () => ({ PricingPresetsService: service }));
vi.mock('../label-secret/label-secret-config.service', () => ({ LabelSecretConfigService: configService }));
vi.mock('../../../lib/prisma', () => ({ prisma: { $queryRaw: vi.fn().mockResolvedValue([{ result: 1 }]) }, transactionModel: {}, activityLogModel: {} }));

const secret = process.env.JWT_SECRET || 'fallback_secret_key_change_in_production';
const admin = jwt.sign({ userId: '11111111-1111-4111-8111-111111111111', role: 'ADMIN' }, secret);
const employee = jwt.sign({ userId: '22222222-2222-4222-8222-222222222222', role: 'EMPLOYEE' }, secret);
const presetId = '33333333-3333-4333-8333-333333333333';
const payload = {
  name: 'AC', expensePercent: '10', profitPercent: '7', discountBufferPercent: '7',
  installmentMarkupPercent: '20', downPaymentPercent: '40', defaultInstallmentMonths: 3,
  reason: 'Create AC formula', accountPassword: 'secret',
};

describe('pricing preset routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    service.list.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 25 });
    service.get.mockResolvedValue({ id: presetId });
    service.create.mockResolvedValue({ id: presetId });
    service.setDefault.mockResolvedValue({ id: presetId, isDefault: true });
    service.setLabelSecret.mockResolvedValue({ id: presetId, isLabelSecretAllowed: true });
    service.clearLabelSecret.mockResolvedValue({ id: presetId, isLabelSecretAllowed: false });
    service.audit.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 50 });
    configService.get.mockResolvedValue({ settings: null, allowedPricingPresets: [], encodingPresets: [] });
    configService.updateSettings.mockResolvedValue({ settings: {}, allowedPricingPresets: [], encodingPresets: [] });
  });

  it('requires authentication but permits staff reads', async () => {
    expect((await request(app).get('/api/v1/pricing-presets')).status).toBe(401);
    expect((await request(app).get('/api/v1/pricing-presets').set('Authorization', `Bearer ${employee}`)).status).toBe(200);
  });

  it('protects mutations and validates formula input', async () => {
    expect((await request(app).post('/api/v1/pricing-presets').set('Authorization', `Bearer ${employee}`).send(payload)).status).toBe(403);
    expect((await request(app).post('/api/v1/pricing-presets').set('Authorization', `Bearer ${admin}`).send(payload)).status).toBe(201);
    expect((await request(app).post('/api/v1/pricing-presets').set('Authorization', `Bearer ${admin}`).send({ ...payload, downPaymentPercent: '101' })).status).toBe(400);
  });

  it('lets only admins choose or clear the secret label preset', async () => {
    const action = { accountPassword: 'secret' };
    for (const path of ['set-label-secret', 'clear-label-secret']) {
      expect((await request(app).post(`/api/v1/pricing-presets/${presetId}/${path}`).set('Authorization', `Bearer ${employee}`).send(action)).status).toBe(403);
      expect((await request(app).post(`/api/v1/pricing-presets/${presetId}/${path}`).set('Authorization', `Bearer ${admin}`).send(action)).status).toBe(200);
      expect((await request(app).post(`/api/v1/pricing-presets/${presetId}/${path}`).set('Authorization', `Bearer ${admin}`).send({})).status).toBe(400);
    }
    expect(service.setLabelSecret).toHaveBeenCalledTimes(1);
    expect(service.clearLabelSecret).toHaveBeenCalledTimes(1);
  });

  it('registers action and audit routes before preset detail', async () => {
    const action = { reason: 'Promote this formula', accountPassword: 'secret' };
    expect((await request(app).post(`/api/v1/pricing-presets/${presetId}/set-default`).set('Authorization', `Bearer ${admin}`).send(action)).status).toBe(200);
    expect((await request(app).get(`/api/v1/pricing-presets/${presetId}/audit`).set('Authorization', `Bearer ${admin}`)).status).toBe(200);
    expect(service.get).not.toHaveBeenCalled();
  });

  it('accepts multiple allowed presets in password-only label-secret settings', async () => {
    const second = '44444444-4444-4444-8444-444444444444';
    const encoding = '55555555-5555-4555-8555-555555555555';
    const input = { allowedPricingPresetIds: [presetId, second], defaultPricingPresetId: second, defaultEncodingPresetId: encoding, showCodeOnLabel: true, accountPassword: 'secret' };
    expect((await request(app).patch('/api/v1/pricing-presets/label-secret-settings').set('Authorization', `Bearer ${employee}`).send(input)).status).toBe(403);
    expect((await request(app).patch('/api/v1/pricing-presets/label-secret-settings').set('Authorization', `Bearer ${admin}`).send({ ...input, reason: 'not required' })).status).toBe(400);
    expect((await request(app).patch('/api/v1/pricing-presets/label-secret-settings').set('Authorization', `Bearer ${admin}`).send(input)).status).toBe(200);
    expect(configService.updateSettings).toHaveBeenCalledWith(input, expect.objectContaining({ role: 'ADMIN' }), expect.anything());
  });

  it('accepts the automatic staged-discount encoding mode', async () => {
    const input = {
      name: 'Automatic staged discount', mode: 'STAGED_DISCOUNT', prefix: '', suffix: '', offset: '0',
      digitMap: null, decimalPlaces: 0, isActive: true, accountPassword: 'secret',
    };
    configService.createEncoding.mockResolvedValue({ id: '55555555-5555-4555-8555-555555555555', ...input });

    expect((await request(app).post('/api/v1/pricing-presets/label-secret-encodings').set('Authorization', `Bearer ${employee}`).send(input)).status).toBe(403);
    expect((await request(app).post('/api/v1/pricing-presets/label-secret-encodings').set('Authorization', `Bearer ${admin}`).send(input)).status).toBe(201);
    expect(configService.createEncoding).toHaveBeenCalledWith(input, expect.objectContaining({ role: 'ADMIN' }), expect.anything());
  });
});
