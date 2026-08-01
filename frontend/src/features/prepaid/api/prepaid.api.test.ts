import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiMock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
}));

vi.mock('../../../services/api', () => ({ api: apiMock }));

import { prepaidApi } from './prepaid.api';

describe('prepaidApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMock.get.mockResolvedValue({ data: { data: { items: [] } } });
    apiMock.post.mockResolvedValue({ data: { data: { id: 'p1' } } });
  });

  it('lists from /prepaid-purchases with normalized params', async () => {
    await prepaidApi.listPrepaidPurchases({ status: 'DELIVERED', page: 2 });

    expect(apiMock.get).toHaveBeenCalledWith(
      '/prepaid-purchases',
      expect.objectContaining({
        params: expect.objectContaining({ status: 'DELIVERED', page: 2, pageSize: 25 }),
      })
    );
  });

  it('does not read prepaid records from the ledger endpoint', async () => {
    await prepaidApi.listPrepaidPurchases();

    expect(apiMock.get).not.toHaveBeenCalledWith('/financial-ledger', expect.anything());
  });

  it('posts the deliver action', async () => {
    await prepaidApi.deliver('p1', { remainderDueDate: '2026-08-30', deliveryNotes: null });

    expect(apiMock.post).toHaveBeenCalledWith('/prepaid-purchases/p1/deliver', {
      remainderDueDate: '2026-08-30',
      deliveryNotes: null,
    });
  });

  it('posts the revert action', async () => {
    await prepaidApi.revertDelivery('p1', { reason: 'wrong unit', accountPassword: 'secret' });

    expect(apiMock.post).toHaveBeenCalledWith('/prepaid-purchases/p1/revert-delivery', {
      reason: 'wrong unit',
      accountPassword: 'secret',
    });
  });
});
