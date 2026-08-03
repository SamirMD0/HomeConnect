import { SalesChannel, SalesOrderFulfillmentStatus } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import {
  addSalesOrderItemSchema,
  createSalesOrderSchema,
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
});
