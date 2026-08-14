import { describe, expect, it } from 'vitest';
import { salesOrderPrefillFromRouteState } from './SalesOrdersPage';

describe('sales order scanner route state', () => {
  it('accepts only a non-empty product id', () => {
    expect(salesOrderPrefillFromRouteState({ prefillOrderProductId: 'product-1' })).toEqual({ productId: 'product-1' });
    expect(salesOrderPrefillFromRouteState({ prefillOrderProductId: '' })).toBeNull();
    expect(salesOrderPrefillFromRouteState({ prefillOrderProductId: 123 })).toBeNull();
    expect(salesOrderPrefillFromRouteState(null)).toBeNull();
  });

  it('does not import price, quantity, customer, payment, or status fields', () => {
    const prefill = salesOrderPrefillFromRouteState({
      prefillOrderProductId: 'product-1', price: '1.00', quantity: 99,
      customerId: 'customer-1', paymentMode: 'UNPAID', fulfillmentStatus: 'DELIVERED',
    });
    expect(prefill).toEqual({ productId: 'product-1' });
    expect(Object.keys(prefill ?? {})).toEqual(['productId']);
  });
});
