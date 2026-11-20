import { describe, expect, it, vi } from 'vitest';
import { RelayStore } from './store';
import type { RelayClient } from './client';
import { recordsInput } from './inputs';
describe('relay record visibility', () => {
  it('fails closed for legacy workers that omit visibility on reports or users', () => {
    const record = {
      entity: 'report',
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      branchId: null,
      op: 'upsert',
      data: {},
    };
    expect(recordsInput.parse({ pcSeq: '1', records: [record] }).records[0].minRole).toBe('ADMIN');
    expect(
      recordsInput.safeParse({ pcSeq: '1', records: [{ ...record, minRole: 'EMPLOYEE' }] }).success
    ).toBe(false);
  });
  it('bounds pages by bytes without skipping the next large report', async () => {
    const tx = {
      relayWorker: { findUniqueOrThrow: async () => ({ prunedThroughRev: 0n }) },
      $queryRaw: async () => [1n, 2n].map((rev) => ({ rev, size: 1200 * 1024 + 20 })),
      relayRecord: {
        findMany: async () =>
          [1n, 2n].map((rev) => ({
            entity: 'report',
            entityId: String(rev),
            branchId: 'a',
            previousBranchIds: [],
            rev,
            op: 'upsert',
            minRole: 'ADMIN',
            data: { rows: 'x'.repeat(1200 * 1024) },
          })),
      },
    };
    const store = new RelayStore({
      $transaction: async (work: any) => work(tx),
    } as unknown as RelayClient);
    const page = await store.readRecords(['a'], '0', 500, { role: 'ADMIN' });
    expect(page.records).toHaveLength(1);
    expect(page.nextRev).toBe('1');
    expect(page.hasMore).toBe(true);
  });
  it('fills a page with up to 500 small records and loads only what fits', async () => {
    const all = Array.from({ length: 900 }, (_, index) => BigInt(index + 1));
    const product = (rev: bigint) => ({
      entity: 'product', entityId: String(rev), branchId: null, previousBranchIds: [], rev,
      op: 'upsert', minRole: null, data: { name: 'Fan' },
    });
    const findMany = vi.fn(async ({ take }: { take: number }) => all.slice(0, take).map(product));
    const tx = {
      relayWorker: { findUniqueOrThrow: async () => ({ prunedThroughRev: 0n }) },
      $queryRaw: vi.fn(async () => all.slice(0, 501).map((rev) => ({ rev, size: 40 }))),
      relayRecord: { findMany },
    };
    const store = new RelayStore({ $transaction: async (work: any) => work(tx) } as unknown as RelayClient);
    const page = await store.readRecords(['a'], '0', 500, { role: 'EMPLOYEE' });
    expect(page.records).toHaveLength(500);
    expect(page.nextRev).toBe('500');
    expect(page.hasMore).toBe(true);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 500 }));

    // Large rows: only those that fit the page budget are loaded at all.
    tx.$queryRaw.mockResolvedValueOnce(all.slice(0, 501).map((rev) => ({ rev, size: 400 * 1024 })));
    findMany.mockClear();
    const big = await store.readRecords(['a'], '0', 500, { role: 'EMPLOYEE' });
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 4 }));
    expect(big.hasMore).toBe(true);
  });
  it('returns an empty last page without loading rows', async () => {
    const findMany = vi.fn();
    const tx = {
      relayWorker: { findUniqueOrThrow: async () => ({ prunedThroughRev: 0n }) },
      $queryRaw: async () => [],
      relayRecord: { findMany },
    };
    const store = new RelayStore({ $transaction: async (work: any) => work(tx) } as unknown as RelayClient);
    const page = await store.readRecords(['a'], '42', 500, { role: 'EMPLOYEE' });
    expect(page).toMatchObject({ records: [], nextRev: '42', hasMore: false });
    expect(findMany).not.toHaveBeenCalled();
  });
  it.each([false, true])(
    'never returns admin data to staff (fullCopy=%s), retaining delete revisions',
    async (fullCopy) => {
      const rows = [
        {
          entity: 'report',
          entityId: 'r',
          branchId: 'a',
          previousBranchIds: [],
          rev: 7n,
          op: 'upsert',
          minRole: 'ADMIN',
          data: { secret: 'PC money' },
        },
        {
          entity: 'product',
          entityId: 'p',
          branchId: null,
          previousBranchIds: [],
          rev: 8n,
          op: 'upsert',
          minRole: null,
          data: { name: 'Fan' },
        },
      ];
      const tx = {
        relayWorker: { findUniqueOrThrow: vi.fn(async () => ({ prunedThroughRev: 0n })) },
        $queryRaw: vi.fn(async () => rows.map((row) => ({ rev: row.rev, size: 30 }))),
        relayRecord: { findMany: vi.fn(async () => rows) },
      };
      const store = new RelayStore({
        $transaction: async (work: any) => work(tx),
      } as unknown as RelayClient);
      const staff = await store.readRecords(['a'], '0', 500, { role: 'EMPLOYEE', fullCopy });
      expect(staff.records[0]).toMatchObject({ id: 'r', op: 'delete', data: null, rev: '7' });
      expect(JSON.stringify(staff)).not.toContain('PC money');
      expect(staff.records[1]?.op).toBe('upsert');
      const admin = await store.readRecords(['a'], '0', 500, { role: 'ADMIN', fullCopy });
      expect(admin.records[0]).toMatchObject({ op: 'upsert', data: { secret: 'PC money' } });
    }
  );
  it('redacts previously applied admin action results after a role downgrade', async () => {
    const db = {
      relayOutbox: {
        findMany: vi.fn(async () => [
          {
            id: 'action',
            type: 'report.request',
            status: 'applied',
            result: { report: { secret: 'money' } },
          },
        ]),
      },
    };
    const store = new RelayStore(db as unknown as RelayClient);
    expect(await store.actionResults('device', ['action'], 'EMPLOYEE')).toEqual([
      {
        id: 'action',
        status: 'refused',
        result: { code: 'FORBIDDEN', message: expect.any(String) },
      },
    ]);
    expect((await store.actionResults('device', ['action'], 'ADMIN'))[0]?.result).toEqual({
      report: { secret: 'money' },
    });
  });
  it('waits for the PC to refuse staff reports, preserves its exact message and strips all other result data', async () => {
    const rows = [
      { id: 'pending', branchId: 'a', type: 'report.request', status: 'pending', result: null },
      {
        id: 'refused',
        branchId: 'a',
        type: 'report.request',
        status: 'refused',
        result: {
          code: 'FORBIDDEN',
          message: 'The exact PC refusal.',
          report: { secret: 'money' },
        },
      },
    ];
    const findMany = vi.fn(async () => rows);
    const store = new RelayStore({ relayOutbox: { findMany } } as unknown as RelayClient);
    expect(
      await store.actionResults('device', ['pending', 'refused'], 'EMPLOYEE', ['a'], 'user')
    ).toEqual([
      { id: 'pending', status: 'pending', result: null },
      {
        id: 'refused',
        status: 'refused',
        result: { code: 'FORBIDDEN', message: 'The exact PC refusal.' },
      },
    ]);
    const denied = await store.actionResults('device', ['refused'], 'EMPLOYEE', ['b'], 'user');
    expect(JSON.stringify(denied)).not.toContain('exact PC');
    expect(JSON.stringify(denied)).not.toContain('money');
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ deviceId: 'device', userId: 'user' }),
      })
    );
  });
});
