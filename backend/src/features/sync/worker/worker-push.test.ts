import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SyncWorkerState } from '@prisma/client';
import { pushRecords, refreshCustomerDates, type PushDependencies } from './worker-push';
import { RelayFailure, WorkerRelay } from './relay-client';

let state: SyncWorkerState;
const deps = { cursor: vi.fn(), page: vi.fn(), scope: vi.fn(), save: vi.fn(), feed: vi.fn() };
const request = vi.fn();
describe('worker push', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    state = { snapshotDone: true, lastPushedSeq: '5', snapshotProgress: null,
      openingStart: new Date('1970-01-01T00:00:00Z'), lastDateRefresh: null } as SyncWorkerState;
    deps.scope.mockResolvedValue({ mode: 'all', branchIds: ['a', 'b'] });
    deps.cursor.mockResolvedValue('10');
    deps.page.mockResolvedValue({ records: [], after: '', done: true });
    deps.feed.mockResolvedValue({ records: [], nextSeq: '5', hasMore: false });
    request.mockImplementation(async path => path === '/state' ? { lastPcSeq: '100' } : { completed: false });
  });
  const run = () => pushRecords(state, { request }, Date.now() + 10000, deps as PushDependencies);
  it('takes max sequence before enumeration, stages all pages with that cursor, then acknowledges completion', async () => {
    state.snapshotDone = false;
    await run();
    expect(deps.cursor.mock.invocationCallOrder[0]).toBeLessThan(deps.page.mock.invocationCallOrder[0]);
    expect(request).toHaveBeenCalledWith('/snapshot/begin', expect.objectContaining({ pcSeq: '10', expectedPcSeq: '100' }));
    expect(deps.page.mock.calls.map(call => call[0])).toEqual(['product', 'customer', 'supplier', 'supplier_bill', 'branch', 'category', 'user', 'sales_order']);
    expect(deps.save).toHaveBeenCalledWith(expect.objectContaining({ snapshotDone: true, lastPushedSeq: '10' }));
    expect(request.mock.invocationCallOrder[request.mock.calls.findIndex(call => call[0] === '/snapshot/finish')])
      .toBeLessThan(deps.save.mock.invocationCallOrder[deps.save.mock.calls.findIndex(call => call[0].snapshotDone)]);
  });
  it('advances delta cursor only after relay 200', async () => {
    deps.feed.mockResolvedValue({ records: [], nextSeq: '9', hasMore: false });
    request.mockRejectedValueOnce(new RelayFailure(503));
    await expect(run()).rejects.toThrow();
    expect(deps.save).not.toHaveBeenCalled();
    request.mockResolvedValue({});
    await run();
    expect(deps.save).toHaveBeenCalledWith({ lastPushedSeq: '9' });
  });
  it('stops on a busy feed without contacting the relay or advancing', async () => {
    deps.feed.mockResolvedValue({ records: [], nextSeq: '5', hasMore: false, busy: true });
    expect(await run()).toBe(false);
    expect(request).not.toHaveBeenCalled();
    expect(deps.save).not.toHaveBeenCalled();
  });
  it('resets stale cursors into a full replacement snapshot', async () => {
    deps.feed.mockResolvedValue({ records: [], nextSeq: '6', hasMore: false });
    request.mockRejectedValue(new RelayFailure(409, 'STALE_PC_CURSOR'));
    expect(await run()).toBe(false);
    expect(deps.save).toHaveBeenCalledWith(expect.objectContaining({ snapshotDone: false }));
    expect(deps.save.mock.calls.some(call => call[0].lastPushedSeq)).toBe(false);
  });
  it('caps delta at twenty batches', async () => {
    deps.feed.mockImplementation(async after => ({ records: [], nextSeq: (after + 1n).toString(), hasMore: true }));
    expect(await run()).toBe(false);
    expect(deps.feed).toHaveBeenCalledTimes(20);
  });
  it('refreshes only nonzero customers and records the business date after acknowledgement', async () => {
    deps.page.mockResolvedValue({ done: true, records: ['0.00', '8.50'].map((outstanding, index) => ({
      entity: 'customer', id: String(index), op: 'upsert', branchId: 'a', data: { financial: { outstanding } },
    })) });
    await refreshCustomerDates(state, { request }, Date.now() + 10000, deps as PushDependencies);
    expect(request.mock.calls[0][1].records).toHaveLength(1);
    expect(deps.save).toHaveBeenCalledWith(expect.objectContaining({ lastDateRefresh: expect.any(Date) }));
  });
  it('authenticates every request, refuses redirects, and hides relay errors including secrets', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: 'BAD', message: 'private-secret' } }), { status: 500 }));
    const relay = new WorkerRelay('https://relay.example', 'private-secret', Date.now() + 120000, fetcher);
    await expect(relay.request('/state')).rejects.toThrow('Cloud sync request failed');
    expect(fetcher.mock.calls[0][1]).toMatchObject({ redirect: 'error', headers: { Authorization: 'Bearer private-secret' } });
  });
});
