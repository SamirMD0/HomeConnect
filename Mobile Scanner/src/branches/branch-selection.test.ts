import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleBranchRejection, onBranchRejected, selectAccessibleBranch, selectedBranchHeaders, setSelectedBranch } from './branch-selection';
import { authedHeaders, requestJson } from '../api/hc-client';
import { uploadReceipt } from '../api/receipts-api';
const a = { id: 'a', name: 'Main' }, b = { id: 'b', name: 'Second' };
afterEach(() => { setSelectedBranch(null); vi.unstubAllGlobals(); });
describe('mobile branch selection', () => {
  it('automatically selects the sole accessible branch without a prompt', () => { expect(selectAccessibleBranch([a], null)).toEqual(a); });
  it('requires a picker for many branches and restores only an accessible saved selection', () => {
    expect(selectAccessibleBranch([a, b], null)).toBeNull();
    expect(selectAccessibleBranch([a, b], 'revoked')).toBeNull();
    expect(selectAccessibleBranch([a, b], 'b')).toEqual(b);
  });
  it('blocks supplier actions with zero accessible branches', () => { expect(selectAccessibleBranch([], 'a')).toBeNull(); });
  it('attaches selected scope to every JSON request and authenticated headers', async () => {
    setSelectedBranch('a');
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, data: [] }) });
    vi.stubGlobal('fetch', fetchMock);
    await requestJson('http://pc/api/v1/suppliers');
    expect(fetchMock.mock.calls[0][1].headers['X-Branch-Scope']).toBe('a');
    expect(authedHeaders({ baseUrl: '', token: 'jwt' })).toEqual({ Authorization: 'Bearer jwt', 'X-Branch-Scope': 'a' });
    setSelectedBranch(null);
    expect(selectedBranchHeaders()).toEqual({});
  });
  it('clears a rejected selection and notifies the picker on JSON 403', async () => {
    setSelectedBranch('a'); const listener = vi.fn(); const off = onBranchRejected(listener);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403, json: async () => ({ error: { code: 'BRANCH_ACCESS_DENIED' } }) }));
    await expect(requestJson('http://pc/api/v1/suppliers')).rejects.toMatchObject({ code: 'BRANCH_ACCESS_DENIED' });
    expect(selectedBranchHeaders()).toEqual({}); expect(listener).toHaveBeenCalledOnce(); off();
  });
  it('attaches scope to receipt bytes and returns to picker on upload 403', async () => {
    setSelectedBranch('b'); const listener = vi.fn(); const off = onBranchRejected(listener);
    const fetchMock = vi.fn().mockResolvedValueOnce({ blob: async () => new Blob(['photo']) }).mockResolvedValueOnce({ ok: false, status: 403, json: async () => ({ error: { code: 'BRANCH_ACCESS_DENIED' } }) });
    vi.stubGlobal('fetch', fetchMock);
    await expect(uploadReceipt({ baseUrl: 'http://pc', token: 'jwt' }, { supplierPurchaseId: 'p', localUri: 'file:photo', mime: 'image/jpeg' })).rejects.toMatchObject({ code: 'BRANCH_ACCESS_DENIED' });
    expect(fetchMock.mock.calls[1][1].headers['X-Branch-Scope']).toBe('b');
    expect(listener).toHaveBeenCalledOnce(); expect(selectedBranchHeaders()).toEqual({}); off();
  });
  it('does not clear a new selection for a stale denial or unrelated error', () => {
    setSelectedBranch('b');
    expect(handleBranchRejection(403, 'BRANCH_ACCESS_DENIED', 'a')).toBe(false);
    expect(handleBranchRejection(403, 'FORBIDDEN', 'b')).toBe(false);
    expect(handleBranchRejection(500, 'BRANCH_ACCESS_DENIED', 'b')).toBe(false);
    expect(selectedBranchHeaders()).toEqual({ 'X-Branch-Scope': 'b' });
  });
});
