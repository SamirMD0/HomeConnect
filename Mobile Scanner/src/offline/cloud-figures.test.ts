import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { REPORT_CATALOG } from '@shared/report-catalog';
import { memoryDb } from './testing/memory-db';
import { applyRecords } from './record-store';
import { CloudDataSource } from './data-source';
import { configureCloudReader, setCloudMode } from './cloud-mode';
import { setSelectedBranch } from '../branches/branch-selection';
import { getDashboard } from '../api/dashboard-api';
import { getReceivablesSummary } from '../api/receivables-api';
import { getReport } from '../api/reports-api';
import { cloudReceipt, cloudReport } from './cloud-figures';
import { saveAction } from './outbox';
import { OutboxSender } from './outbox-sender';
import type { LocalDb } from './local-db';
let db: LocalDb, source: CloudDataSource;
const money = '9007199254740993.25',
  updatedAt = '2026-11-17T08:00:00Z';
const client = { baseUrl: 'https://relay.example', token: 'local' };
const definition = REPORT_CATALOG.find((report) => report.id === 'sales-summary')!;
const dashboard = {
  meta: { generatedAt: updatedAt, range: { from: '2026-11-17', to: '2026-11-17' } },
  data: { kpis: [{ key: 'collectedToday', value: money, valueKind: 'money' }] },
};
beforeEach(async () => {
  db = await memoryDb();
  source = new CloudDataSource(db, ['a'], 'ADMIN', 'device:user');
  configureCloudReader((url, init) => source.read(url, init));
  setCloudMode(true);
  setSelectedBranch('a');
  vi.stubGlobal(
    'fetch',
    vi.fn(() => {
      throw Error('No network should be used');
    })
  );
  await applyRecords(db, 'records', [
    {
      entity: 'dashboard',
      id: 'd',
      branchId: 'a',
      rev: '1',
      op: 'upsert',
      data: { period: 'today', businessDate: '2026-11-17', updatedAt, response: dashboard },
    },
    {
      entity: 'receivables_summary',
      id: 's',
      branchId: 'a',
      rev: '2',
      op: 'upsert',
      data: {
        businessDate: '2026-11-17',
        updatedAt,
        response: {
          summary: { totalOutstanding: money, totalOverdue: '12.34' },
          tierCounts: { LATE: 1 },
        },
      },
    },
    {
      entity: 'report',
      id: 'r',
      branchId: 'a',
      minRole: 'ADMIN',
      rev: '3',
      op: 'upsert',
      data: {
        reportId: 'sales-summary',
        period: 'today',
        updatedAt,
        businessDate: '2026-11-17',
        response: { rows: [{ total: money }] },
      },
    },
  ]);
});
afterEach(() => {
  setCloudMode(false);
  configureCloudReader(null);
  setSelectedBranch(null);
  vi.unstubAllGlobals();
});
describe('offline PC figures and receipts', () => {
  it('reads exact PC dashboard, totals and report values with the snapshot time and no network', async () => {
    expect(await getDashboard(client, { range: 'today', includeArchived: false })).toEqual({
      ...dashboard,
      cloudSnapshot: { updatedAt, businessDate: '2026-11-17' },
    });
    expect(await getReceivablesSummary(client)).toEqual({
      totalOutstanding: money,
      totalOverdue: '12.34',
      snapshotUpdatedAt: updatedAt,
    });
    expect(await getReport(client, definition, { period: 'today' })).toMatchObject({
      rows: [{ total: money }],
      cloudSnapshot: { updatedAt },
    });
    expect(fetch).not.toHaveBeenCalled();
  });
  it('never exposes cached ADMIN reports to staff and shows a missing state for an unpushed period', async () => {
    await expect(
      new CloudDataSource(db, ['a'], 'EMPLOYEE').read(
        'https://relay.example/api/v1/reports/sales/summary?period=today',
        { headers: { 'X-Branch-Scope': 'a' } }
      )
    ).rejects.toThrow('administrators');
    expect(await getReport(client, definition, { period: 'lastMonth' })).toEqual({
      cloudMissing: true,
    });
  });
  it('reads an applied on-demand result only for its owner/branch and expires it after 24 hours', async () => {
    const action = await saveAction(
      db,
      {
        owner: 'device:user',
        submissionKey: 'request',
        type: 'report.request',
        branchId: 'a',
        payload: { reportId: 'sales-summary', filters: { period: 'lastMonth' } },
        summary: 'Report',
      },
      { uuid: () => 'action' }
    );
    const result = {
      reportId: 'sales-summary',
      filters: { period: 'lastMonth' },
      report: { rows: [{ total: money }] },
      updatedAt: new Date().toISOString(),
    };
    await new OutboxSender(db, 'device:user', async (path, init) => {
      if (init?.method === 'POST') {
        expect(JSON.parse(String(init.body))).toMatchObject({
          id: action.id,
          type: 'report.request',
          payload: { reportId: 'sales-summary', filters: { period: 'lastMonth' } },
        });
        return { status: 'pending' };
      }
      return [{ id: action.id, status: 'applied', result }];
    }).sync();
    expect(await getReport(client, definition, { period: 'lastMonth' })).toMatchObject({
      rows: [{ total: money }],
    });
    expect(
      await cloudReport(db, ['a'], 'ADMIN', 'other:user', 'sales-summary', { period: 'lastMonth' })
    ).toEqual({ cloudMissing: true });
    await db.exec('UPDATE outbox SET updated_at=?', [
      new Date(Date.now() - 86400001).toISOString(),
    ]);
    expect(await getReport(client, definition, { period: 'lastMonth' })).toEqual({
      cloudMissing: true,
    });
  });
  it('opens only an applied own payment receipt from its stored result; older actions keep the Wi-Fi fallback', async () => {
    await saveAction(
      db,
      {
        owner: 'device:user',
        submissionKey: 'payment',
        type: 'customer_payment.create',
        branchId: 'a',
        payload: {},
        summary: 'Payment',
      },
      { uuid: () => 'payment-action' }
    );
    await expect(cloudReceipt(db, 'device:user', 'a', 'payment', 'payment-action')).rejects.toThrow(
      'Wi-Fi'
    );
    const receipt = {
      payment: { id: 'payment', totalAmount: money },
      business: { shopName: 'Shop' },
      updatedAt,
    };
    await db.exec("UPDATE outbox SET local_status='applied',result=?", [
      JSON.stringify({ id: 'payment', receipt }),
    ]);
    expect(await cloudReceipt(db, 'device:user', 'a', 'payment', 'payment-action')).toEqual(
      receipt
    );
    await expect(cloudReceipt(db, 'other:user', 'a', 'payment', 'payment-action')).rejects.toThrow(
      'Wi-Fi'
    );
    await db.exec('UPDATE outbox SET result=?', [JSON.stringify({ id: 'payment' })]);
    await expect(cloudReceipt(db, 'device:user', 'a', 'payment')).rejects.toThrow('Wi-Fi');
  });
});
