import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureApiSession } from './hc-client';
import { setSelectedBranch } from '../branches/branch-selection';
import { getReceivablesPage, getReceivablesSummary, overdueTiers, receivablesQuery } from './receivables-api';

const client = { baseUrl: 'http://pc:3011', token: 'access' };
const summary = {
  customerCount: 40,
  customersWithBalance: 12,
  customersOverdue: 5,
  atRiskCount: 2,
  totalOutstanding: '1250.00',
  totalOverdue: '300.00',
};
const response = (page: number, totalPages: number) => ({
  status: 200,
  json: async () => ({
    success: true,
    data: {
      businessDate: '2026-11-14',
      summary,
      tierCounts: { CRITICAL: 1, SEVERE: 1, LATE: 1, WATCH: 2, CURRENT: 7, NO_ACTIVITY: 0 },
      items: [{ customer: { id: 'c1', name: 'Rami', phone: '70', isActive: true }, outstanding: '50.00' }],
      pagination: { page, limit: 25, total: 30, totalPages },
    },
  }),
});
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  setSelectedBranch('branch-a');
  fetchMock = vi.fn(async () => response(1, 2));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  configureApiSession(null);
  setSelectedBranch(null);
  vi.unstubAllGlobals();
});

describe('receivables api', () => {
  it('sends one tier= per standing, only customers with a balance, worst amounts first', () => {
    const query = new URLSearchParams(receivablesQuery({ search: ' rami ', tiers: overdueTiers }, 2, 25));
    expect(query.getAll('tier')).toEqual(['CRITICAL', 'SEVERE', 'LATE', 'WATCH']);
    expect(query.get('search')).toBe('rami');
    expect(query.get('onlyWithBalance')).toBe('true');
    expect(query.get('sortBy')).toBe('outstanding');
    expect(query.get('sortOrder')).toBe('desc');
    expect(query.get('page')).toBe('2');
    expect(new URLSearchParams(receivablesQuery({ sortBy: 'name' }, 1, 25)).get('sortOrder')).toBe('asc');
  });

  it('pages with the PC totals and the selected branch', async () => {
    const first = await getReceivablesPage(client, {}, 1);
    expect(first.nextPage).toBe(2);
    expect(first.summary).toEqual(summary);
    expect(first.items[0]!.customer.name).toBe('Rami');
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toMatch(/^http:\/\/pc:3011\/api\/v1\/receivables\?/);
    expect((init.headers as Record<string, string>)['X-Branch-Scope']).toBe('branch-a');
    fetchMock.mockResolvedValueOnce(response(2, 2));
    expect((await getReceivablesPage(client, {}, 2)).nextPage).toBeUndefined();
  });

  it('reads Home totals with a one-row request', async () => {
    expect(await getReceivablesSummary(client)).toEqual(summary);
    expect(new URLSearchParams(String(fetchMock.mock.calls[0]![0]).split('?')[1]).get('limit')).toBe('1');
  });
});
