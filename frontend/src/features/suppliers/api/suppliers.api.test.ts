import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supplierLedgerApi } from './supplier-ledger.api';
import { suppliersApi } from './suppliers.api';
import { supplierTransactionsApi } from './supplier-transactions.api';

const { apiMock } = vi.hoisted(() => ({ apiMock: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() } }));
vi.mock('../../../services/api', () => ({ api: apiMock }));

describe('supplier APIs', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uses the supplier directory and protected supplier endpoints', async () => {
    apiMock.get.mockResolvedValue({ data: { data: [], meta: { pagination: {} } } });
    apiMock.post.mockResolvedValue({ data: { data: {} } });
    await suppliersApi.list({ search: 'نور', isActive: true, page: 2 });
    expect(apiMock.get).toHaveBeenCalledWith('/suppliers', { params: { search: 'نور', isActive: true, page: 2 } });
    await suppliersApi.archive('supplier-1', { reason: 'Closed business', accountPassword: 'secret' });
    expect(apiMock.post).toHaveBeenCalledWith('/suppliers/supplier-1/archive', { reason: 'Closed business', accountPassword: 'secret' });
  });

  it('uses distinct transaction and ledger endpoints', async () => {
    apiMock.post.mockResolvedValue({ data: { data: {} } });
    apiMock.get.mockResolvedValue({ data: { data: { summary: {}, items: [], pagination: {} } } });
    await supplierTransactionsApi.create('supplier-1', { type: 'SUPPLIER_PAYMENT', amount: '100.00', transactionDate: '2026-07-29', description: 'Cash payment' });
    expect(apiMock.post).toHaveBeenCalledWith('/suppliers/supplier-1/transactions', expect.objectContaining({ amount: '100.00' }));
    apiMock.get.mockResolvedValue({ data: { data: [], meta: { pagination: {} } } });
    await supplierTransactionsApi.listGlobal({ includeRemoved: true, page: 2 });
    expect(apiMock.get).toHaveBeenCalledWith('/supplier-transactions', { params: { includeRemoved: true, page: 2 } });
    apiMock.get.mockResolvedValue({ data: { data: { summary: {}, items: [], pagination: {} } } });
    await supplierLedgerApi.get({ type: 'SUPPLIER_PAYMENT', includeRemoved: true, page: 3 });
    expect(apiMock.get).toHaveBeenCalledWith('/supplier-ledger', { params: { type: 'SUPPLIER_PAYMENT', includeRemoved: true, page: 3 } });
  });
});
