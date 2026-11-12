import { afterEach, describe, expect, it, vi } from 'vitest';
import { configureApiSession, HcApiError, parseJsonEnvelope, requestJson } from './hc-client';
afterEach(() => {
  configureApiSession(null);
  vi.unstubAllGlobals();
});
const url = 'http://pc:3011/api/v1/customers';
describe('shared API error handling', () => {
  it.each([
    [400, 'VALIDATION'],
    [401, 'UNAUTHORIZED'],
    [403, 'BRANCH'],
    [404, 'NOT_FOUND'],
    [409, 'BRANCH'],
    [413, 'TOO_LARGE'],
    [429, 'RATE_LIMITED'],
    [503, 'SERVER'],
  ])('maps %s and preserves server details', (status, kind) => {
    try {
      parseJsonEnvelope(
        Number(status),
        { error: { code: 'CODE', message: 'Actual message' } },
        null
      );
      throw new Error('Expected failure');
    } catch (error) {
      expect(error).toMatchObject({ kind, status, code: 'CODE', message: 'Actual message' });
    }
  });
  it('refreshes once for concurrent 401s, then retries with the new token', async () => {
    let token = 'old';
    const refresh = vi.fn(async () => {
      await Promise.resolve();
      token = 'new';
      return token;
    });
    const signOut = vi.fn(async () => {
      token = '';
    });
    configureApiSession({ baseUrl: 'http://pc:3011', getToken: () => token, refresh, signOut });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url, init) =>
        init.headers.Authorization === 'Bearer old'
          ? { status: 401, json: async () => ({ error: { code: 'UNAUTHORIZED' } }) }
          : { status: 200, json: async () => ({ success: true, data: ['ok'] }) }
      )
    );
    const init = { headers: { Authorization: 'Bearer old' } };
    expect(await Promise.all([requestJson(url, init), requestJson(url, init)])).toEqual([
      ['ok'],
      ['ok'],
    ]);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(signOut).not.toHaveBeenCalled();
  });
  it('signs out when no refresh session is available, without retrying forever', async () => {
    let token: string | null = 'old';
    const signOut = vi.fn(async () => {
      token = null;
    });
    const refresh = vi.fn(async () => null);
    configureApiSession({ baseUrl: 'http://pc:3011', getToken: () => token, refresh, signOut });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ status: 401, json: async () => ({ error: { code: 'UNAUTHORIZED' } }) }))
    );
    await expect(
      requestJson(url, { headers: { Authorization: 'Bearer old' } })
    ).rejects.toMatchObject({ kind: 'UNAUTHORIZED' });
    expect(refresh).toHaveBeenCalledOnce();
    expect(signOut).toHaveBeenCalledOnce();
  });
  it('preserves the session and reports offline when reactive refresh has a network error', async () => {
    const signOut = vi.fn(),
      onConnectionChange = vi.fn();
    configureApiSession({
      baseUrl: 'http://pc:3011',
      getToken: () => 'old',
      refresh: vi.fn().mockRejectedValue(new HcApiError('Wi-Fi lost', 'NETWORK')),
      signOut,
      onConnectionChange,
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ status: 401, json: async () => ({ error: { code: 'UNAUTHORIZED' } }) }))
    );
    await expect(
      requestJson(url, { headers: { Authorization: 'Bearer old' } })
    ).rejects.toMatchObject({ kind: 'NETWORK' });
    expect(signOut).not.toHaveBeenCalled();
    expect(onConnectionChange).toHaveBeenLastCalledWith(false);
  });
  it('signs out on a rejected refresh token but preserves credentials on a temporary server error', async () => {
    const signOut = vi.fn();
    const refresh = vi.fn().mockRejectedValue(new HcApiError('Temporary failure', 'SERVER', 503));
    configureApiSession({ baseUrl: 'http://pc:3011', getToken: () => 'old', refresh, signOut });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ status: 401, json: async () => ({ error: {} }) }))
    );
    await expect(
      requestJson(url, { headers: { Authorization: 'Bearer old' } })
    ).rejects.toMatchObject({ status: 503 });
    expect(signOut).not.toHaveBeenCalled();
    refresh.mockRejectedValue(new HcApiError('Refresh rejected', 'UNAUTHORIZED', 401));
    await expect(
      requestJson(url, { headers: { Authorization: 'Bearer old' } })
    ).rejects.toMatchObject({ status: 401 });
    expect(signOut).toHaveBeenCalledOnce();
  });
  it('never refreshes a late request against a previously selected PC', async () => {
    const refresh = vi.fn(),
      signOut = vi.fn();
    configureApiSession({
      baseUrl: 'http://new-pc:3011',
      getToken: () => 'new-pc-token',
      refresh,
      signOut,
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ status: 401, json: async () => ({ error: { code: 'UNAUTHORIZED' } }) }))
    );
    await expect(
      requestJson(url, { headers: { Authorization: 'Bearer old' } })
    ).rejects.toMatchObject({ kind: 'UNAUTHORIZED' });
    expect(refresh).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
  });
  it('does not replay an old request in a newly signed-in session on the same PC', async () => {
    const refresh = vi.fn(),
      signOut = vi.fn();
    configureApiSession({ baseUrl: 'http://pc:3011', getToken: () => 'old', refresh, signOut });
    let respond!: (response: Response) => void;
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          respond = resolve;
        })
    );
    vi.stubGlobal('fetch', fetchMock);
    const request = requestJson(url, { headers: { Authorization: 'Bearer old' } });
    configureApiSession({
      baseUrl: 'http://pc:3011',
      getToken: () => 'new-user',
      refresh,
      signOut,
    });
    respond({ status: 401, json: async () => ({ error: { code: 'UNAUTHORIZED' } }) } as Response);
    await expect(request).rejects.toMatchObject({ kind: 'UNAUTHORIZED' });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(refresh).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
  });
});
