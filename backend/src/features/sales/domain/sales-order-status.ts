import { SalesChannel, SalesOrderFulfillmentStatus } from '@prisma/client';
import { InvalidSalesTransitionError } from './sales-errors';

export const OPEN_SALES_ORDER_STATUSES = [
  SalesOrderFulfillmentStatus.DRAFT,
  SalesOrderFulfillmentStatus.CONFIRMED,
  SalesOrderFulfillmentStatus.PREPARING,
  SalesOrderFulfillmentStatus.READY_FOR_DELIVERY,
  SalesOrderFulfillmentStatus.OUT_FOR_DELIVERY,
] as const;

export const TERMINAL_SALES_ORDER_STATUSES = [
  SalesOrderFulfillmentStatus.DELIVERED,
  SalesOrderFulfillmentStatus.CANCELLED,
  SalesOrderFulfillmentStatus.RETURNED,
] as const;

const STATUS_RANK: Record<SalesOrderFulfillmentStatus, number> = {
  DRAFT: 0,
  CONFIRMED: 1,
  PREPARING: 2,
  READY_FOR_DELIVERY: 3,
  OUT_FOR_DELIVERY: 4,
  DELIVERED: 5,
  CANCELLED: 6,
  RETURNED: 7,
};

export function isTerminalSalesOrderStatus(status: SalesOrderFulfillmentStatus): boolean {
  return TERMINAL_SALES_ORDER_STATUSES.includes(
    status as (typeof TERMINAL_SALES_ORDER_STATUSES)[number]
  );
}

export function isRoutineForwardSalesOrderTransition(
  current: SalesOrderFulfillmentStatus,
  target: SalesOrderFulfillmentStatus
): boolean {
  return !isTerminalSalesOrderStatus(target) && STATUS_RANK[target] >= STATUS_RANK[current];
}

export function assertSalesOrderStatusTransitionAllowed(
  channel: SalesChannel,
  current: SalesOrderFulfillmentStatus,
  target: SalesOrderFulfillmentStatus
): void {
  if (current === target) throw new InvalidSalesTransitionError('Sales order already has this status');
  if (isTerminalSalesOrderStatus(current)) {
    throw new InvalidSalesTransitionError('Final sales orders must use restore or return actions');
  }
  if (target === SalesOrderFulfillmentStatus.RETURNED) {
    throw new InvalidSalesTransitionError('Use the return action to return an order');
  }

  if (target === SalesOrderFulfillmentStatus.CANCELLED) return;

  if (channel === SalesChannel.SHOP_DIRECT) {
    const allowed =
      (current === SalesOrderFulfillmentStatus.DRAFT && target === SalesOrderFulfillmentStatus.CONFIRMED) ||
      (current === SalesOrderFulfillmentStatus.CONFIRMED && target === SalesOrderFulfillmentStatus.DELIVERED) ||
      (current === SalesOrderFulfillmentStatus.CONFIRMED && target === SalesOrderFulfillmentStatus.DRAFT);
    if (!allowed) throw new InvalidSalesTransitionError('Status is not valid for a shop-direct order');
    return;
  }

  if (target === SalesOrderFulfillmentStatus.DELIVERED && current !== SalesOrderFulfillmentStatus.OUT_FOR_DELIVERY) {
    throw new InvalidSalesTransitionError('Order must be out for delivery before it can be delivered');
  }

  if (STATUS_RANK[target] < STATUS_RANK[current]) return;
  if (STATUS_RANK[target] !== STATUS_RANK[current] + 1) {
    throw new InvalidSalesTransitionError('Fulfillment stages cannot be skipped');
  }
}
