import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import axios, { AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import { api } from './api';
import {
  BRANCH_ACCESS_DENIED_EVENT,
  BRANCH_SCOPE_HEADER,
  setBranchScopeHeader,
  withBranchScope,
} from '../features/branches/scope/branch-scope-store';

const requestHandler = () => {
  const handlers = (api.interceptors.request as unknown as { handlers: Array<{ fulfilled: (c: InternalAxiosRequestConfig) => InternalAxiosRequestConfig }> }).handlers;
  return handlers[0].fulfilled;
};
const responseRejected = () => {
  const handlers = (api.interceptors.response as unknown as { handlers: Array<{ rejected: (e: unknown) => Promise<unknown> }> }).handlers;
  return handlers[handlers.length - 1].rejected;
};
const config = (headers: Record<string, string> = {}) =>
  ({ headers: new AxiosHeaders(headers), url: '/customers' }) as InternalAxiosRequestConfig;

describe('API branch scope', () => {
  const dispatchEvent = vi.fn();

  beforeEach(() => {
    vi.spyOn(axios, 'post').mockResolvedValue({ data: {} });
    (globalThis as unknown as { window: unknown }).window = { location: { pathname: '/', hash: '' }, dispatchEvent };
    dispatchEvent.mockClear();
  });
  afterEach(() => setBranchScopeHeader(null));

  it('sends no X-Branch-Scope before the scope is known', () => {
    setBranchScopeHeader(null);
    expect(requestHandler()(config()).headers[BRANCH_SCOPE_HEADER]).toBeUndefined();
  });

  it('sends the selected branch id, or "all"', () => {
    setBranchScopeHeader('11111111-1111-4111-8111-111111111111');
    expect(requestHandler()(config()).headers[BRANCH_SCOPE_HEADER]).toBe('11111111-1111-4111-8111-111111111111');
    setBranchScopeHeader('all');
    expect(requestHandler()(config()).headers[BRANCH_SCOPE_HEADER]).toBe('all');
  });

  it('lets a per-request override win over the selected scope', () => {
    setBranchScopeHeader('all');
    const override = withBranchScope('22222222-2222-4222-8222-222222222222');
    const result = requestHandler()(config(override.headers as Record<string, string>));
    expect(result.headers[BRANCH_SCOPE_HEADER]).toBe('22222222-2222-4222-8222-222222222222');
  });

  it('raises the access-denied event on 403 BRANCH_ACCESS_DENIED only', async () => {
    const reject = responseRejected();
    const denied = { response: { status: 403, data: { error: { code: 'BRANCH_ACCESS_DENIED' } } }, config: { url: '/customers' } };
    await expect(reject(denied)).rejects.toBe(denied);
    expect(dispatchEvent).toHaveBeenCalledTimes(1);
    expect((dispatchEvent.mock.calls[0][0] as Event).type).toBe(BRANCH_ACCESS_DENIED_EVENT);

    dispatchEvent.mockClear();
    const otherForbidden = { response: { status: 403, data: { error: { code: 'FORBIDDEN' } } }, config: { url: '/customers' } };
    await expect(reject(otherForbidden)).rejects.toBe(otherForbidden);
    expect(dispatchEvent).not.toHaveBeenCalled();
  });
});
