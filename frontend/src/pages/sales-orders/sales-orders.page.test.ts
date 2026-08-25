import { describe, expect, it } from 'vitest';
import {
  salesOrderPrefillFromNavigation,
  salesOrderPrefillFromRouteState,
  salesOrderPrefillFromSearchParams,
  stripSalesOrderProductPrefill,
} from './SalesOrdersPage';

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

  it('reads query-param prefill first and strips only the one-shot product id', () => {
    const params = new URLSearchParams('action=add&productId=query-product&date=2026-08-21');
    expect(salesOrderPrefillFromSearchParams(params)).toEqual({ productId: 'query-product' });
    expect(salesOrderPrefillFromNavigation(params, { prefillOrderProductId: 'state-product' }))
      .toEqual({ productId: 'query-product' });
    expect(stripSalesOrderProductPrefill(params.toString())).toBe('?action=add&date=2026-08-21');
  });

  it('keeps route state as the fallback when the query has no product id', () => {
    expect(salesOrderPrefillFromNavigation(new URLSearchParams('action=add'), {
      prefillOrderProductId: 'state-product',
    })).toEqual({ productId: 'state-product' });
  });
});
