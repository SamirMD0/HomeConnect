import { SalesReturnRefundMethod, SalesReturnStockDisposition } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { returnSalesOrderSchema } from '../sales-orders/sales-orders.validator';

const valid = {
  idempotencyKey: 'return-request-001',
  items: [{
    salesOrderItemId: '11111111-1111-4111-8111-111111111111',
    quantity: 1,
    stockDisposition: SalesReturnStockDisposition.SELLABLE,
    conditionNote: null,
  }],
  returnDeliveryFee: false,
  refundMethod: SalesReturnRefundMethod.NONE,
  reason: 'Customer requested a return',
  overrideReturnWindow: false,
  windowOverrideReason: null,
  accountPassword: 'secret',
};

describe('returnSalesOrderSchema', () => {
  it('accepts the explicit atomic-return contract', () => {
    expect(returnSalesOrderSchema.parse(valid)).toMatchObject(valid);
  });

  it('rejects duplicate lines and non-positive quantities', () => {
    expect(returnSalesOrderSchema.safeParse({ ...valid, items: [valid.items[0], valid.items[0]] }).success).toBe(false);
    expect(returnSalesOrderSchema.safeParse({ ...valid, items: [{ ...valid.items[0], quantity: 0 }] }).success).toBe(false);
  });

  it('requires a distinct reason only when an override is claimed', () => {
    expect(returnSalesOrderSchema.safeParse({ ...valid, overrideReturnWindow: true, windowOverrideReason: null }).success).toBe(false);
    expect(returnSalesOrderSchema.safeParse({ ...valid, windowOverrideReason: 'Not requested' }).success).toBe(false);
  });
});
