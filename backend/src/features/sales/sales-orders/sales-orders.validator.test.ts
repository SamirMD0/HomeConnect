import { SalesChannel, SalesOrderFulfillmentStatus } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import {
  addSalesOrderItemSchema,
  createSalesOrderSchema,
  deductSalesOrderStockSchema,
  restoreSalesOrderStockSchema,
  salesOrderListQuerySchema,
  salesOrderItemActionSchema,
  updateSalesOrderItemSchema,
  updateSalesOrderSchema,
} from './sales-orders.validator';

const base = {
  customerId: '11111111-1111-4111-8111-111111111111',
  salesChannel: SalesChannel.SHOP_DIRECT,
  orderDate: '2026-08-03',
  fulfillmentStatus: SalesOrderFulfillmentStatus.CONFIRMED,
  paidAmount: '10.00',
  items: [{ manualProductName: 'Air conditioner', quantity: 1, unitPrice: '10.00' }],
};

describe('sales order validation', () => {
  it('strips client-calculated money and accepts exactly one product mode', () => {
    const parsed = createSalesOrderSchema.parse({
      ...base,
      totalAmount: '999.00',
      remainingAmount: '999.00',
      paymentStatus: 'UNPAID',
      items: [{ ...base.items[0], lineTotal: '999.00' }],
    });
    expect(parsed).not.toHaveProperty('totalAmount');
    expect(parsed.items[0]).not.toHaveProperty('lineTotal');
    expect(() => createSalesOrderSchema.parse({
      ...base,
      items: [{ ...base.items[0], productId: '22222222-2222-4222-8222-222222222222' }],
    })).toThrow();
  });

  it('rejects delivery fields for shop-direct orders', () => {
    expect(() => createSalesOrderSchema.parse({ ...base, deliveryFee: '5.00' })).toThrow('Shop-direct');
    expect(() => createSalesOrderSchema.parse({ ...base, deliveryDate: '2026-08-04' })).toThrow('Shop-direct');
  });

  it('rejects zero items and over-precision money', () => {
    expect(() => createSalesOrderSchema.parse({ ...base, items: [] })).toThrow();
    expect(() => createSalesOrderSchema.parse({ ...base, paidAmount: '1.001' })).toThrow();
  });

  it('accepts debtDueDate on every total-changing mutation payload', () => {
    const debtDueDate = '2026-08-10';
    expect(updateSalesOrderSchema.parse({ deliveryFee: '5.00', debtDueDate })).toMatchObject({ debtDueDate });
    expect(addSalesOrderItemSchema.parse({ ...base.items[0], debtDueDate })).toMatchObject({ debtDueDate });
    expect(updateSalesOrderItemSchema.parse({ unitPrice: '15.00', debtDueDate })).toMatchObject({ debtDueDate });
    expect(salesOrderItemActionSchema.parse({ debtDueDate })).toMatchObject({ debtDueDate });
  });

  it('keeps stock document authority on the server and validates unique selections', () => {
    const itemId = '33333333-3333-4333-8333-333333333333';
    expect(() => deductSalesOrderStockSchema.parse({
      itemIds: [itemId],
      note: 'Counter sale',
      productId: '44444444-4444-4444-8444-444444444444',
      quantity: 999,
      referenceId: '55555555-5555-4555-8555-555555555555',
      accountPassword: 'ignored',
    })).toThrow();
    expect(deductSalesOrderStockSchema.parse({ itemIds: [itemId], note: 'Counter sale' }))
      .toEqual({ itemIds: [itemId], note: 'Counter sale' });
    expect(() => deductSalesOrderStockSchema.parse({ itemIds: [itemId, itemId] })).toThrow('must not contain duplicates');
    expect(() => deductSalesOrderStockSchema.parse({ itemIds: [itemId], note: '<script>alert(1)</script>' }))
      .toThrow('must not contain HTML');
  });

  it('requires a typed restoration reason without accepting a password field', () => {
    const fulfillmentId = '66666666-6666-4666-8666-666666666666';
    expect(() => restoreSalesOrderStockSchema.parse({ fulfillmentIds: [fulfillmentId], reason: '   ' }))
      .toThrow('Reason is required');
    expect(() => restoreSalesOrderStockSchema.parse({
      fulfillmentIds: [fulfillmentId],
      reason: 'Customer cancelled',
      accountPassword: 'ignored',
    })).toThrow();
    expect(restoreSalesOrderStockSchema.parse({ fulfillmentIds: [fulfillmentId], reason: 'Customer cancelled' }))
      .toEqual({ fulfillmentIds: [fulfillmentId], reason: 'Customer cancelled' });
    expect(() => restoreSalesOrderStockSchema.parse({
      fulfillmentIds: [fulfillmentId], reason: '<b>Customer cancelled</b>',
    })).toThrow('must not contain HTML');
  });

  it('accepts only the explicit awaiting-stock filter value', () => {
    expect(salesOrderListQuerySchema.parse({ awaitingStockDeduction: 'true' })).toMatchObject({
      awaitingStockDeduction: true,
    });
    expect(() => salesOrderListQuerySchema.parse({ awaitingStockDeduction: 'false' })).toThrow();
  });
});
