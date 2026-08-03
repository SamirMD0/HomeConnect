import { SalesChannel, SalesOrderFulfillmentStatus } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import {
  assertSalesOrderStatusTransitionAllowed,
  isRoutineForwardSalesOrderTransition,
  isTerminalSalesOrderStatus,
} from './sales-order-status';

describe('sales order fulfillment status', () => {
  it('allows the delivery workflow and sensitive backward moves', () => {
    expect(() => assertSalesOrderStatusTransitionAllowed(
      SalesChannel.SHOP_DELIVERY,
      SalesOrderFulfillmentStatus.CONFIRMED,
      SalesOrderFulfillmentStatus.PREPARING
    )).not.toThrow();
    expect(() => assertSalesOrderStatusTransitionAllowed(
      SalesChannel.PHONE_ORDER,
      SalesOrderFulfillmentStatus.READY_FOR_DELIVERY,
      SalesOrderFulfillmentStatus.CONFIRMED
    )).not.toThrow();
  });

  it('allows the shop-direct shortcut but rejects delivery stages', () => {
    expect(() => assertSalesOrderStatusTransitionAllowed(
      SalesChannel.SHOP_DIRECT,
      SalesOrderFulfillmentStatus.CONFIRMED,
      SalesOrderFulfillmentStatus.DELIVERED
    )).not.toThrow();
    expect(() => assertSalesOrderStatusTransitionAllowed(
      SalesChannel.SHOP_DIRECT,
      SalesOrderFulfillmentStatus.CONFIRMED,
      SalesOrderFulfillmentStatus.PREPARING
    )).toThrow();
  });

  it('rejects skipped delivery stages and transitions out of terminal states', () => {
    expect(() => assertSalesOrderStatusTransitionAllowed(
      SalesChannel.SHOP_DELIVERY,
      SalesOrderFulfillmentStatus.CONFIRMED,
      SalesOrderFulfillmentStatus.OUT_FOR_DELIVERY
    )).toThrow();
    expect(() => assertSalesOrderStatusTransitionAllowed(
      SalesChannel.SHOP_DELIVERY,
      SalesOrderFulfillmentStatus.DELIVERED,
      SalesOrderFulfillmentStatus.CONFIRMED
    )).toThrow();
  });

  it('classifies terminal and routine transitions', () => {
    expect(isTerminalSalesOrderStatus(SalesOrderFulfillmentStatus.CANCELLED)).toBe(true);
    expect(isTerminalSalesOrderStatus(SalesOrderFulfillmentStatus.CONFIRMED)).toBe(false);
    expect(isRoutineForwardSalesOrderTransition(
      SalesOrderFulfillmentStatus.CONFIRMED,
      SalesOrderFulfillmentStatus.PREPARING
    )).toBe(true);
    expect(isRoutineForwardSalesOrderTransition(
      SalesOrderFulfillmentStatus.PREPARING,
      SalesOrderFulfillmentStatus.CONFIRMED
    )).toBe(false);
  });
});
