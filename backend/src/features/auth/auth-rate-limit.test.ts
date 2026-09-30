import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { app } from '../../app';
import { AuthService } from '../../services/auth.service';

describe('auth rate limits', () => {
  afterEach(() => vi.restoreAllMocks());
  it('returns 429 on the 11th login attempt from one IP', async () => {
    vi.spyOn(AuthService, 'login').mockResolvedValue({ user: {}, accessToken: 'access', refreshToken: 'refresh' } as never);
    let response;
    for (let attempt = 0; attempt < 11; attempt += 1) {
      response = await request(app).post('/api/v1/auth/login').send({ username: 'admin', password: 'password' });
    }
    expect(response?.status).toBe(429);
  });
});
