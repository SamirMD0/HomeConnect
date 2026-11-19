import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SyncWorkerState } from '@prisma/client';
import {
  pushFigures,
  loadFigure,
  snapshotId,
  stableJson,
  type FigureDependencies,
} from './worker-figures';
import { readReport, REPORT_LIMIT } from './report-read';
let state: SyncWorkerState, clock: number, date: string;
const deps = {
  now: () => new Date(clock),
  date: () => date,
  scope: vi.fn(),
  save: vi.fn(),
  admin: vi.fn(),
  read: vi.fn(),
};
const relay = { request: vi.fn() };
const run = (deadline = Infinity, reports = false) =>
  pushFigures(state, relay, deadline, deps as unknown as FigureDependencies, reports);
beforeEach(() => {
  vi.resetAllMocks();
  clock = Date.parse('2026-11-17T10:00:00Z');
  date = '2026-11-17';
  state = {
    lastPushedSeq: '10',
    figureSnapshots: {},
    openingStart: new Date('1970-01-01T07:00Z'),
    openingEnd: new Date('1970-01-01T22:00Z'),
  } as SyncWorkerState;
  deps.scope.mockResolvedValue({ branchIds: ['branch'] });
  deps.admin.mockResolvedValue({ id: 'admin', role: 'ADMIN' });
  deps.save.mockImplementation(async (data) => {
    state = { ...state, ...data };
    return state;
  });
  deps.read.mockImplementation(async (path: string) => ({
    summary: { totalOutstanding: '123.45' },
    tierCounts: { LATE: 1 },
    data: { kpis: [] },
    meta: { generatedAt: new Date(clock).toISOString() },
    source: path,
  }));
});
describe('budgeted PC figure snapshots', () => {
  it('loads the exact Home and default receivables routes and labels them consistently', async () => {
    await run();
    expect(deps.read.mock.calls.map(([path]) => path)).toEqual([
      '/dashboard/overview?range=today&includeArchived=false',
      '/dashboard/overview?range=week&includeArchived=false',
      '/dashboard/overview?range=month&includeArchived=false',
      '/receivables?onlyWithBalance=true&sortBy=outstanding&sortOrder=desc&page=1&limit=1',
    ]);
    // One batched request instead of one per figure (the relay allows 120 a minute).
    expect(relay.request).toHaveBeenCalledTimes(1);
    const records: { minRole: string | null; branchId: string; id: string; data: { response: { source: string } } }[] = relay.request.mock.calls[0][1].records;
    expect(records).toHaveLength(4);
    expect(records.every((row) => row.minRole === null && row.branchId === 'branch')).toBe(true);
    expect(records[0].data.response.source).toBe(deps.read.mock.calls[0][0]);
    expect(records[0].id).toBe(snapshotId('dashboard|branch|today'));
    expect(snapshotId('dashboard|branch|today')).toMatch(
      /^[\da-f]{8}-[\da-f]{4}-5[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/
    );
  });
  it('does no work without changes, throttles to fifteen minutes, and ignores volatile generation timestamps when hashing', async () => {
    await run();
    relay.request.mockClear();
    deps.read.mockClear();
    await run();
    expect(deps.read).not.toHaveBeenCalled();
    state.lastPushedSeq = '11';
    clock += 14 * 60000;
    await run();
    expect(deps.read).not.toHaveBeenCalled();
    clock += 60000;
    await run();
    expect(deps.read).toHaveBeenCalledTimes(4);
    expect(relay.request).not.toHaveBeenCalled();
    expect(stableJson({ b: 2, meta: { generatedAt: 'old' }, a: 1 })).toBe(
      stableJson({ a: 1, meta: { generatedAt: 'new' }, b: 2 })
    );
  });
  it('refreshes at the first business-date change even outside opening hours', async () => {
    await run();
    relay.request.mockClear();
    date = '2026-11-18';
    clock = Date.parse('2026-11-17T22:05:00Z');
    await run();
    expect(relay.request).toHaveBeenCalledTimes(1);
    expect(relay.request.mock.calls[0][1].records).toHaveLength(4);
  });
  it('persists progress only after a batch is acknowledged and resumes after the time budget', async () => {
    deps.read.mockImplementation(async (path: string) => {
      clock += 1000;
      return { source: path };
    });
    await run(clock + 2500);
    // Cut off mid-batch: nothing was sent, so no progress or hash is saved.
    expect(relay.request).not.toHaveBeenCalled();
    expect((state.figureSnapshots as any).run.index).toBe(0);
    await run(Infinity);
    expect(relay.request).toHaveBeenCalledTimes(1);
    expect(relay.request.mock.calls[0][1].records).toHaveLength(4);
    expect((state.figureSnapshots as any).run).toBeUndefined();
  });
  it("keeps a whole shop's figures far under the relay's 120 requests a minute", async () => {
    deps.scope.mockResolvedValue({ branchIds: ['b1', 'b2', 'b3', 'b4'] });
    await run(Infinity, true);
    const sent = relay.request.mock.calls.reduce((sum, [, body]) => sum + body.records.length, 0);
    expect(sent).toBeGreaterThan(200);
    expect(relay.request.mock.calls.length).toBeLessThanOrEqual(Math.ceil(sent / 20) + 1);
    expect(relay.request.mock.calls.every(([, body]) => body.records.length <= 20)).toBe(true);
  });
  it('does not save a batch the relay refused, so it is sent again next cycle', async () => {
    relay.request.mockRejectedValueOnce(new Error('relay down'));
    await expect(run()).rejects.toThrow('relay down');
    expect((state.figureSnapshots as any).hashes ?? {}).toEqual({});
    expect((state.figureSnapshots as any).run.index).toBe(0);
    await run();
    expect(relay.request).toHaveBeenCalledTimes(2);
    expect(relay.request.mock.calls[1][1].records).toHaveLength(4);
  });
  it('publishes a small ADMIN stub for a report over 1.5 MB', async () => {
    state.figureSnapshots = {
      hashes: {},
      run: {
        seq: '10',
        date,
        startedAt: new Date(clock).toISOString(),
        index: 0,
        tasks: [
          { entity: 'report', branchId: 'branch', period: 'today', reportId: 'sales-summary' },
        ],
      },
    };
    deps.read.mockResolvedValue({ rows: [{ value: 'x'.repeat(REPORT_LIMIT + 1) }] });
    await run(Infinity, true);
    expect(relay.request.mock.calls[0][1].records[0]).toMatchObject({
      entity: 'report',
      minRole: 'ADMIN',
      data: { response: { tooLarge: true } },
    });
  });
  it('uses the shared report request and gathers monthly pages with the same forty-page cap', async () => {
    const read = vi.fn(async (path: string) => ({
      items: [{ page: new URL('http://pc' + path).searchParams.get('page') }],
      pagination: { page: 1, totalPages: 50 },
    }));
    const report = await readReport(
      'customer-debt-snapshot',
      { period: 'thisMonth', month: '2026-11' },
      read
    );
    expect(read).toHaveBeenCalledTimes(40);
    expect(report.items).toHaveLength(40);
    const rows = vi.fn(async (path: string) => ({ rows: [{ fromPC: path }] }));
    const result = await loadFigure(
      { entity: 'report', branchId: 'branch', period: 'today', reportId: 'sales-summary' },
      date,
      rows
    );
    expect(rows).toHaveBeenCalledWith('/reports/sales/summary?period=today');
    expect(result).toEqual({ rows: [{ fromPC: '/reports/sales/summary?period=today' }] });
  });
});
