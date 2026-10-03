import { afterEach, describe, expect, it, vi } from 'vitest';
import { HcApiError } from './hc-client';
import { recordSupplierPayment } from './supplier-transactions-api';

const client = { baseUrl: 'http://192.168.1.10:3000', token: 'jwt-token' };

function response(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

afterEach(() => vi.unstubAllGlobals());

describe('recordSupplierPayment', () => {
  it('posts the backend supplier-payment body and returns the recorded payment', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(201, {
      success: true,
      data: {
        id: 'transaction-1',
        supplierId: 'supplier-1',
        amount: '125.50',
        currency: 'USD',
        paymentMethod: 'BANK_TRANSFER',
        transactionDate: '2026-10-03',
      },
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(recordSupplierPayment(client, {
      supplierId: 'supplier-1',
      amount: 125.5,
      currency: 'USD',
      paymentMethod: 'BANK_TRANSFER',
      note: 'Invoice 42',
      occurredAt: '2026-10-03T09:30:00.000Z',
    })).resolves.toEqual({
      id: 'transaction-1',
      supplierId: 'supplier-1',
      amount: 125.5,
      currency: 'USD',
      paymentMethod: 'BANK_TRANSFER',
      occurredAt: '2026-10-03',
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://192.168.1.10:3000/api/v1/suppliers/supplier-1/transactions');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer jwt-token' });
    expect(JSON.parse(String(init.body))).toEqual({
      type: 'SUPPLIER_PAYMENT',
      amount: '125.50',
      currency: 'USD',
      paymentMethod: 'BANK_TRANSFER',
      transactionDate: '2026-10-03',
      description: 'Supplier payment / دفعة مورّد',
      notes: 'Invoice 42',
    });
  });

  it.each([
    [401, 'UNAUTHORIZED'],
    [422, 'VALIDATION'],
  ] as const)('maps HTTP %s to %s', async (status, kind) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(status, {
      success: false,
      error: { code: 'REQUEST_REJECTED', message: 'Rejected' },
    })));

    const promise = recordSupplierPayment(client, {
      supplierId: 'supplier-1',
      amount: 10,
      currency: 'USD',
      paymentMethod: 'CASH_USD',
    });

    await expect(promise).rejects.toBeInstanceOf(HcApiError);
    await expect(promise).rejects.toMatchObject({ kind, status });
  });
});
