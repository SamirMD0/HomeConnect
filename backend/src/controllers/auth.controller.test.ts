import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../services/auth.service';
import { AuthController } from './auth.controller';

describe('AuthController refresh cookie flags', () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
  it.each([['true', true, 'none'], ['', false, 'lax']] as const)('uses COOKIE_SECURE=%s', async (value, secure, sameSite) => {
    vi.stubEnv('COOKIE_SECURE', value);
    vi.spyOn(AuthService, 'login').mockResolvedValue({ user: {}, accessToken: 'access', refreshToken: 'refresh' } as never);
    const cookie = vi.fn();
    const response = { cookie, status: vi.fn().mockReturnThis(), json: vi.fn() };
    await AuthController.login({ body: { username: 'admin', password: 'password' } } as never, response as never, vi.fn());
    expect(cookie).toHaveBeenCalledWith('refreshToken', 'refresh', expect.objectContaining({ secure, sameSite }));
  });
});
