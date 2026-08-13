import { beforeEach, describe, expect, it, vi } from 'vitest';

const { apiMock } = vi.hoisted(() => ({ apiMock: { get: vi.fn(), post: vi.fn(), patch: vi.fn() } }));
vi.mock('../../../services/api', () => ({ api: apiMock }));

import { salesOrdersApi } from './sales-orders.api';

describe('sales order stock API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMock.post.mockResolvedValue({ data: { data: { message: 'ok', fulfillments: [] } } });
  });

  it('sends only line selection and optional note for deduction', async () => {
    await salesOrdersApi.deductStock('order-1', { itemIds: ['item-1'], note: 'Counter sale' });
    expect(apiMock.post).toHaveBeenCalledWith('/sales-orders/order-1/deduct-stock', {
      itemIds: ['item-1'], note: 'Counter sale',
    });
    expect(JSON.stringify(apiMock.post.mock.calls)).not.toContain('accountPassword');
  });

  it('sends fulfillment ids and typed reason without a password for restoration', async () => {
    await salesOrdersApi.restoreStock('order-1', { fulfillmentIds: ['fulfillment-1'], reason: 'Customer cancelled' });
    expect(apiMock.post).toHaveBeenCalledWith('/sales-orders/order-1/restore-stock', {
      fulfillmentIds: ['fulfillment-1'], reason: 'Customer cancelled',
    });
    expect(JSON.stringify(apiMock.post.mock.calls)).not.toContain('accountPassword');
  });
});
