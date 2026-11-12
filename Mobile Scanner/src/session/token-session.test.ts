import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TokenSession } from './token-session';
import { configureApiSession, prepareApiSession, requestJson } from '../api/hc-client';
import {
  loadAuthToken,
  loadAuthUser,
  loadConnection,
  loadRefreshToken,
  saveConnection,
} from '../storage/secure-storage';
import { registerForegroundSession } from './foreground-session';

const secure = vi.hoisted(() => ({ values: new Map<string, string>() }));
vi.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 1,
  getItemAsync: vi.fn(async (key: string) => secure.values.get(key) ?? null),
  setItemAsync: vi.fn(async (key: string, value: string) => {
    secure.values.set(key, value);
  }),
  deleteItemAsync: vi.fn(async (key: string) => {
    secure.values.delete(key);
  }),
}));
const connection = { host: '127.0.0.1', port: 3011 },
  baseUrl = 'http://127.0.0.1:3011';
const user = { id: 'u', username: 'staff', fullName: 'Shop Staff', role: 'EMPLOYEE' as const };
const response = (status: number, data: unknown, refresh?: string) => ({
  status,
  headers: new Headers(refresh ? { 'X-Refresh-Token': refresh } : {}),
  json: async () =>
    status === 200 ? { success: true, data } : { error: { code: 'UNAUTHORIZED' } },
});
beforeEach(() => {
  secure.values.clear();
  vi.clearAllMocks();
});
afterEach(() => {
  configureApiSession(null);
  vi.unstubAllGlobals();
});
async function setup(access = 'old') {
  const changed = vi.fn(),
    session = new TokenSession(changed);
  await session.login(access, user, 'stored-refresh');
  const signOut = vi.fn(() => session.signOut(connection));
  configureApiSession({
    baseUrl,
    getToken: () => session.accessToken,
    refresh: () => session.refresh(connection),
    signOut,
  });
  return { session, signOut, changed };
}
describe('device refresh credentials', () => {
  it('restores both tokens and single-flights concurrent refreshes with the stored token; rotation persists', async () => {
    await setup();
    const session = new TokenSession(vi.fn());
    await session.restore();
    const refresh = vi.fn(() => session.refresh(connection));
    configureApiSession({
      baseUrl,
      getToken: () => session.accessToken,
      refresh,
      signOut: vi.fn(),
    });
    const fetch = vi.fn(async (url: string, init: RequestInit) => {
      if (url.endsWith('/refresh')) {
        expect(init.headers).toMatchObject({
          Authorization: 'Bearer old',
          'X-Refresh-Token': 'stored-refresh',
        });
        return response(200, { accessToken: 'new' }, 'rotated-refresh');
      }
      return response(
        (init.headers as Record<string, string>).Authorization === 'Bearer old' ? 401 : 200,
        ['ok']
      );
    });
    vi.stubGlobal('fetch', fetch);
    const init = { headers: { Authorization: 'Bearer old' } };
    expect(
      await Promise.all([
        requestJson(`${baseUrl}/api/v1/customers`, init),
        requestJson(`${baseUrl}/api/v1/customers`, init),
      ])
    ).toEqual([['ok'], ['ok']]);
    expect(refresh).toHaveBeenCalledOnce();
    expect(await loadAuthToken()).toBe('new');
    expect(await loadRefreshToken()).toBe('rotated-refresh');
  });
  it('keeps the stored refresh token if the PC does not rotate it', async () => {
    const { session } = await setup();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response(200, { accessToken: 'new' }))
    );
    await session.refresh(connection);
    expect(await loadRefreshToken()).toBe('stored-refresh');
  });
  it.each([false, true])(
    'logout clears both tokens even when offline=%s, while preserving PC settings',
    async (offline) => {
      const { session } = await setup();
      await saveConnection(connection);
      const fetch = vi.fn(async (url: string, init: RequestInit) => {
        expect(url).toBe(`${baseUrl}/api/v1/auth/logout`);
        expect(init.headers).toMatchObject({ 'X-Refresh-Token': 'stored-refresh' });
        if (offline) throw new TypeError('offline');
        return response(200, undefined);
      });
      vi.stubGlobal('fetch', fetch);
      await session.signOut(connection);
      expect(session.accessToken).toBeNull();
      expect(await loadAuthToken()).toBeNull();
      expect(await loadRefreshToken()).toBeNull();
      expect(await loadAuthUser()).toBeNull();
      expect(await loadConnection()).toEqual(connection);
      expect(fetch).toHaveBeenCalledOnce();
    }
  );
  it('keeps both credentials on a refresh network error, then refreshes successfully after reconnect', async () => {
    const { session, signOut } = await setup();
    const fetch = vi.fn(async (_url: string) => {
      throw new TypeError('Wi-Fi lost');
    });
    vi.stubGlobal('fetch', fetch);
    await expect(session.refresh(connection)).rejects.toMatchObject({ kind: 'NETWORK' });
    expect(session.accessToken).toBe('old');
    expect(await loadRefreshToken()).toBe('stored-refresh');
    expect(signOut).not.toHaveBeenCalled();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response(200, { accessToken: 'new' }, 'rotated'))
    );
    await session.refresh(connection);
    expect(session.accessToken).toBe('new');
  });
  it('a refresh 401 signs out and clears both credentials through the coordinator', async () => {
    const { signOut } = await setup();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => response(url.endsWith('/logout') ? 200 : 401, undefined))
    );
    await expect(
      requestJson(`${baseUrl}/api/v1/customers`, { headers: { Authorization: 'Bearer old' } })
    ).rejects.toMatchObject({ status: 401 });
    expect(signOut).toHaveBeenCalledOnce();
    expect(await loadAuthToken()).toBeNull();
    expect(await loadRefreshToken()).toBeNull();
  });
  it('a late refresh cannot overwrite credentials from a new login', async () => {
    const { session } = await setup();
    let finish!: (value: unknown) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          })
      )
    );
    const refreshing = session.refresh(connection);
    await session.login('different-access', user, 'different-refresh');
    finish(response(200, { accessToken: 'late-access' }, 'late-refresh'));
    expect(await refreshing).toBeNull();
    expect(await loadAuthToken()).toBe('different-access');
    expect(await loadRefreshToken()).toBe('different-refresh');
  });
  it('a slow logout completes credential deletion before a new login is saved', async () => {
    const { session } = await setup();
    let finish!: (value: unknown) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          })
      )
    );
    const clearing = session.signOut(connection);
    const login = session.login('new-user-access', user, 'new-user-refresh');
    expect(session.accessToken).toBeNull();
    finish(response(200, undefined));
    await Promise.all([clearing, login]);
    expect(session.accessToken).toBe('new-user-access');
    expect(await loadAuthToken()).toBe('new-user-access');
    expect(await loadRefreshToken()).toBe('new-user-refresh');
  });
  it('a foreground refresh network error holds business requests, retains credentials, and recovers after reconnect', async () => {
    const access = `header.${Buffer.from(JSON.stringify({ exp: Date.now() / 1000 + 120 })).toString('base64url')}.sig`;
    const { session, signOut } = await setup(access);
    const onConnectionChange = vi.fn();
    configureApiSession({
      baseUrl,
      getToken: () => session.accessToken,
      refresh: () => session.refresh(connection),
      signOut,
      onConnectionChange,
    });
    const fetch = vi.fn(async (_url: string) => {
      throw new TypeError('Wi-Fi lost');
    });
    vi.stubGlobal('fetch', fetch);
    const init = { headers: { Authorization: `Bearer ${access}` } };
    await expect(requestJson(`${baseUrl}/api/v1/customers`, init)).rejects.toMatchObject({
      kind: 'NETWORK',
    });
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[0]?.[0]).toBe(`${baseUrl}/api/v1/auth/refresh`);
    expect(session.accessToken).toBe(access);
    expect(await loadRefreshToken()).toBe('stored-refresh');
    expect(signOut).not.toHaveBeenCalled();
    expect(onConnectionChange).toHaveBeenLastCalledWith(false);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url.endsWith('/refresh')
          ? response(200, { accessToken: 'reconnected' }, 'rotated')
          : response(200, ['ok'])
      )
    );
    expect(await requestJson(`${baseUrl}/api/v1/customers`, init)).toEqual(['ok']);
    expect(onConnectionChange).toHaveBeenLastCalledWith(true);
  });
  it('foreground near expiry refreshes before requests and queue work can pass the barrier', async () => {
    const access = `header.${Buffer.from(JSON.stringify({ exp: Date.now() / 1000 + 120 })).toString('base64url')}.sig`;
    const { session } = await setup(access);
    // Consume the startup check before simulating a later foreground event.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response(200, { accessToken: access }, 'startup-refresh'))
    );
    await prepareApiSession();
    let notify!: (state: string) => void, finish!: (value: unknown) => void;
    const remove = vi.fn();
    const stop = registerForegroundSession({
      currentState: 'background',
      addEventListener: (_event, listener) => {
        notify = listener;
        return { remove };
      },
    });
    const fetch = vi.fn((url: string, init: RequestInit) => {
      if (url.endsWith('/refresh'))
        return new Promise((resolve) => {
          finish = resolve;
        });
      expect(init.headers).toMatchObject({ Authorization: 'Bearer refreshed' });
      return Promise.resolve(response(200, ['ok']));
    });
    vi.stubGlobal('fetch', fetch);
    notify('active');
    const request = requestJson(`${baseUrl}/api/v1/customers`, {
      headers: { Authorization: `Bearer ${access}` },
    });
    const queueBarrier = prepareApiSession(baseUrl);
    expect(fetch).toHaveBeenCalledOnce();
    finish(response(200, { accessToken: 'refreshed' }, 'foreground-rotated'));
    expect(await request).toEqual(['ok']);
    expect(await queueBarrier).toBe('refreshed');
    expect(session.accessToken).toBe('refreshed');
    expect(await loadRefreshToken()).toBe('foreground-rotated');
    stop();
    expect(remove).toHaveBeenCalledOnce();
  });
});
