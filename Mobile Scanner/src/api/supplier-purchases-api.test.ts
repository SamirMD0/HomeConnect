import { afterEach, describe, expect, it, vi } from 'vitest';
import { HcApiError } from './hc-client';
import { BackendTooOldError, checkSupplierReceipt, recordSupplierPurchase, searchPurchaseProducts } from './supplier-purchases-api';

const client = { baseUrl: 'http://server:3000', token: 'jwt-token' };
const reply = (status: number, data: unknown): Response => ({
  ok: status >= 200 && status < 300, status,
  json: vi.fn().mockResolvedValue(status < 300 ? { success: true, data } : { success: false, error: { message: 'Rejected', code: 'REJECTED' } }),
}) as unknown as Response;

afterEach(() => vi.unstubAllGlobals());

describe('supplier purchase API', () => {
  it('posts an invoice with a stable idempotency key and the exact purchase body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply(201, { id: 'purchase-1', amount: '125.00' }));
    vi.stubGlobal('fetch', fetchMock);
    await recordSupplierPurchase(client, {
      supplierId: 'supplier-1', idempotencyKey: 'invoice-device-1', receiptNumber: 'INV-7',
      transactionDate: '2026-10-03', currency: 'USD', description: 'Purchase: filters',
      receiveStock: false, amountOverride: '125.00', amountOverrideReason: 'Invoice total confirmed',
      lines: [{ kind: 'MANUAL', description: 'filters', amount: '125.00', priceIncludesVat: true }],
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://server:3000/api/v1/suppliers/supplier-1/purchases');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer jwt-token' });
    expect(JSON.parse(String(init.body))).toEqual({
      idempotencyKey: 'invoice-device-1', receiptNumber: 'INV-7', transactionDate: '2026-10-03',
      currency: 'USD', description: 'Purchase: filters', receiveStock: false,
      amountOverride: '125.00', amountOverrideReason: 'Invoice total confirmed',
      lines: [{ kind: 'MANUAL', description: 'filters', amount: '125.00', priceIncludesVat: true }],
    });
  });

  it('searches active products and checks duplicate supplier invoice numbers', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(reply(200, [{ id: 'product-1' }]))
      .mockResolvedValueOnce(reply(200, { duplicate: true, matches: [] }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(searchPurchaseProducts(client, 'filter')).resolves.toHaveLength(1);
    await expect(checkSupplierReceipt(client, 'supplier-1', 'INV-7')).resolves.toMatchObject({ duplicate: true });
    expect(fetchMock.mock.calls[0]?.[0]).toContain('/api/v1/products?search=filter&isActive=true');
    expect(fetchMock.mock.calls[1]?.[0]).toContain('receipt-check?supplierId=supplier-1&receiptNumber=INV-7');
  });

  it('maps a 404 on receipt-check to BackendTooOldError so the operator cannot post a silent duplicate', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply(404, null)));
    await expect(checkSupplierReceipt(client, 'supplier-1', 'INV-7')).rejects.toBeInstanceOf(BackendTooOldError);
  });

  it('propagates unauthorized purchase writes', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply(401, null)));
    const promise = recordSupplierPurchase(client, {
      supplierId: 'supplier-1', idempotencyKey: 'key-1', transactionDate: '2026-10-03',
      currency: 'USD', description: 'Purchase', receiveStock: false,
      lines: [{ kind: 'MANUAL', description: 'filters', amount: '10.00' }],
    });
    await expect(promise).rejects.toBeInstanceOf(HcApiError);
    await expect(promise).rejects.toMatchObject({ kind: 'UNAUTHORIZED', status: 401 });
  });
});
