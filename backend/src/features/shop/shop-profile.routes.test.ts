import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthenticationError } from '../../lib/errors';
import { app } from '../../app';

const { service } = vi.hoisted(() => ({
  service: {
    getShopProfile: vi.fn(),
    updateShopProfile: vi.fn(),
    updateShopProfileLogo: vi.fn(),
  },
}));

vi.mock('./shop-profile.service', () => ({ ShopProfileService: service }));
vi.mock('../../lib/prisma', () => ({
  prisma: { $queryRaw: vi.fn().mockResolvedValue([{ result: 1 }]) },
  transactionModel: {},
  activityLogModel: {},
}));

const secret = process.env.JWT_SECRET || 'fallback_secret_key_change_in_production';
const admin = jwt.sign({ userId: '11111111-1111-4111-8111-111111111111', role: 'ADMIN' }, secret);
const employee = jwt.sign({ userId: '22222222-2222-4222-8222-222222222222', role: 'EMPLOYEE' }, secret);

describe('shop profile routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    service.getShopProfile.mockResolvedValue({
      id: '4c2b1e9f-8c4b-4a2f-8a10-30c9a04c6d21',
      name: 'Home Connect',
      currencyCode: 'USD',
      pricingCardRolloutMode: 'BOTH',
    });
    service.updateShopProfile.mockResolvedValue({ name: 'Home Connect Beirut' });
    service.updateShopProfileLogo.mockResolvedValue({ hasLogo: true, logoMimeType: 'image/webp', logoByteSize: 4 });
  });

  it('requires authentication and permits staff reads', async () => {
    expect((await request(app).get('/api/v1/shop-profile')).status).toBe(401);
    const response = await request(app).get('/api/v1/shop-profile').set('Authorization', `Bearer ${employee}`);
    expect(response.status).toBe(200);
    expect(response.body.data.currencyCode).toBe('USD');
  });

  it('requires an admin and an account password to update details', async () => {
    const input = { name: 'Home Connect Beirut', accountPassword: 'secret' };
    expect((await request(app).patch('/api/v1/shop-profile').send(input)).status).toBe(401);
    expect((await request(app).patch('/api/v1/shop-profile').set('Authorization', `Bearer ${employee}`).send(input)).status).toBe(403);
    expect((await request(app).patch('/api/v1/shop-profile').set('Authorization', `Bearer ${admin}`).send({ name: input.name })).status).toBe(401);

    const response = await request(app)
      .patch('/api/v1/shop-profile')
      .set('Authorization', `Bearer ${admin}`)
      .set('x-request-id', 'shop-profile-update')
      .send(input);
    expect(response.status).toBe(200);
    expect(service.updateShopProfile).toHaveBeenCalledWith(input, expect.objectContaining({ role: 'ADMIN' }), expect.objectContaining({ requestId: 'shop-profile-update' }));
  });

  it('validates and delegates logo uploads', async () => {
    const input = { dataBase64: Buffer.from('RIFF').toString('base64'), mimeType: 'image/webp', accountPassword: 'secret' };
    const response = await request(app).put('/api/v1/shop-profile/logo').set('Authorization', `Bearer ${admin}`).send(input);
    expect(response.status).toBe(200);
    expect(service.updateShopProfileLogo).toHaveBeenCalledWith(expect.any(Buffer), 'image/webp', 'secret', expect.objectContaining({ role: 'ADMIN' }), expect.anything());
  });

  it('returns the authentication error raised for an incorrect password', async () => {
    service.updateShopProfile.mockRejectedValueOnce(new AuthenticationError('Account password is incorrect'));
    const response = await request(app)
      .patch('/api/v1/shop-profile')
      .set('Authorization', `Bearer ${admin}`)
      .send({ name: 'Home Connect Beirut', accountPassword: 'wrong' });
    expect(response.status).toBe(401);
  });
});
