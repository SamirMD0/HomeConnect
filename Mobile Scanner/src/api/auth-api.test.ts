import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchMe, login, testBackendConnection } from './auth-api';

const connection = { host: '192.168.1.10', port: 3011 };
const user = { id: 'user-1', username: 'shop-admin', fullName: 'Shop Admin', role: 'ADMIN' };

afterEach(() => vi.unstubAllGlobals());

describe('mobile authentication API', () => {
  it('checks the account route without sending credentials or attempting login', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({ success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }) });
    vi.stubGlobal('fetch', fetchMock);
    await expect(testBackendConnection(connection)).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
      'http://192.168.1.10:3011/api/v1/auth/me',
      expect.objectContaining({ headers: { Accept: 'application/json' } }),
    );
  });

  it('explains an older scanner-only PC instead of accepting its browser page', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => { throw new SyntaxError('HTML response'); } }));
    await expect(testBackendConnection(connection)).rejects.toMatchObject({
      status: 404, code: 'MOBILE_AUTH_UNAVAILABLE', message: expect.stringContaining('Install the updated HomeConnect desktop build'),
    });
    await expect(login(connection, { username: 'admin', password: 'secret' })).rejects.toMatchObject({
      code: 'MOBILE_AUTH_UNAVAILABLE',
    });
  });

  it('keeps real server and network failures distinct from compatibility failures', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({ success: false, error: { code: 'DATABASE_UNAVAILABLE', message: 'Database unavailable' } }) });
    vi.stubGlobal('fetch', fetchMock);
    await expect(testBackendConnection(connection)).rejects.toMatchObject({ status: 503, code: 'DATABASE_UNAVAILABLE' });
    fetchMock.mockRejectedValue(new TypeError('Network request failed'));
    await expect(testBackendConnection(connection)).rejects.toMatchObject({ kind: 'NETWORK', status: null });
  });

  it('sends the backend username field, not email', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, data: { accessToken: 'token', user } }) });
    vi.stubGlobal('fetch', fetchMock);
    expect((await login(connection, { username: 'shop-admin', password: 'secret' })).user.username).toBe('shop-admin');
    expect(fetchMock).toHaveBeenCalledWith(
      'http://192.168.1.10:3011/api/v1/auth/login',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ username: 'shop-admin', password: 'secret' }) }),
    );
  });

  it('reads the username returned by /auth/me', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, data: user }) });
    vi.stubGlobal('fetch', fetchMock);
    expect((await fetchMe(connection, 'token')).username).toBe('shop-admin');
    expect(fetchMock).toHaveBeenCalledWith(
      'http://192.168.1.10:3011/api/v1/auth/me',
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer token' }) }),
    );
  });
});
