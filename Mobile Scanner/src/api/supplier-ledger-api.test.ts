import { afterEach, describe, expect, it, vi } from 'vitest';
import { HcApiError } from './hc-client';
import { fetchSupplierLedger } from './supplier-ledger-api';

const client = { baseUrl: 'http://server:3000', token: 'jwt-token' };
const row = (id: string, type: string, direction: string, baseAmount: string) => ({
  id, type, direction, baseAmount, transactionDate: '2026-10-03', dueDate: null,
  reference: null, description: 'دفعة مورد',
});
const ledger = (items: unknown[], totalOwed = '100.00', balance = '60.00') => ({
  success: true, data: { summary: { totalOwed, balance }, items, pagination: { page: 1, totalPages: 1 } },
});
const response = (status: number, body: unknown) => ({
  ok: status < 400, status, json: vi.fn().mockResolvedValue(body),
}) as unknown as Response;
afterEach(() => vi.unstubAllGlobals());

describe('fetchSupplierLedger', () => {
  it('normalises two entries and derives USD running balances from the prior range', async () => {
    const fetchMock = vi.fn((url: string) => Promise.resolve(response(200,
      url.includes('dateTo=2025-12-31') ? ledger([], '0.00', '20.00') : ledger([
        row('debt', 'SUPPLIER_DEBT', 'INCREASE_OWED', '100.00'),
        row('payment', 'SUPPLIER_PAYMENT', 'DECREASE_OWED', '40.00'),
      ]))));
    vi.stubGlobal('fetch', fetchMock);
    const result = await fetchSupplierLedger(client, { supplierId: 'supplier-1', from: '2026-01-01', to: '2026-10-03' });
    expect(result).toMatchObject({ openingBalance: 20, closingBalance: 80, totalDebit: 100, totalCredit: 40 });
    expect(result.entries.map(({ type, rawType, debit, credit, balance, currency }) =>
      ({ type, rawType, debit, credit, balance, currency }))).toEqual([
      { type: 'PU', rawType: 'SUPPLIER_DEBT', debit: 100, credit: 0, balance: 120, currency: 'USD' },
      { type: 'PV', rawType: 'SUPPLIER_PAYMENT', debit: 0, credit: 40, balance: 80, currency: 'USD' },
    ]);
    expect(fetchMock.mock.calls[0][0]).toContain('supplierId=supplier-1');
  });

  it('maps an unknown server type to OTHER while preserving the raw type', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(200, ledger([
      row('new', 'SUPPLIER_REBATE', 'DECREASE_OWED', '5.00'),
    ], '0.00', '-5.00'))));
    const result = await fetchSupplierLedger(client, { supplierId: 'supplier-1' });
    expect(result.entries[0]).toMatchObject({ type: 'OTHER', rawType: 'SUPPLIER_REBATE', credit: 5 });
  });

  it('propagates a 401 as an unauthorized HcApiError', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(401, {
      success: false, error: { code: 'UNAUTHORIZED', message: 'Expired' },
    })));
    await expect(fetchSupplierLedger(client, { supplierId: 'supplier-1' }))
      .rejects.toMatchObject({ name: 'HcApiError', kind: 'UNAUTHORIZED', status: 401 } satisfies Partial<HcApiError>);
  });
});
