import { Prisma, SalesOrderStockFulfillmentStatus } from '@prisma/client';

export class SalesOrderInventoryRepository {
  static findOrder(id: string, tx: Prisma.TransactionClient) {
    return tx.salesOrder.findUnique({
      where: { id },
      select: {
        id: true,
        orderNumber: true,
        orderDate: true,
        fulfillmentStatus: true,
        items: {
          select: { id: true, productId: true, quantity: true },
        },
      },
    });
  }

  static findActiveFulfillmentForItem(itemId: string, tx: Prisma.TransactionClient) {
    return tx.salesOrderStockFulfillment.findFirst({
      where: { salesOrderItemId: itemId, status: SalesOrderStockFulfillmentStatus.ACTIVE },
      select: { id: true },
    });
  }

  static findFulfillments(ids: string[], tx: Prisma.TransactionClient) {
    return tx.salesOrderStockFulfillment.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        salesOrderId: true,
        salesOrderItemId: true,
        productId: true,
        quantity: true,
        status: true,
        stockMovementId: true,
        reversalStockMovementId: true,
      },
    });
  }

  static createFulfillment(data: Prisma.SalesOrderStockFulfillmentUncheckedCreateInput, tx: Prisma.TransactionClient) {
    return tx.salesOrderStockFulfillment.create({ data });
  }

  static reverseFulfillment(
    id: string,
    data: {
      reversalStockMovementId: string;
      reversedAt: Date;
      reversedById: string;
      reversalReason: string;
    },
    tx: Prisma.TransactionClient
  ) {
    return tx.salesOrderStockFulfillment.updateMany({
      where: { id, status: SalesOrderStockFulfillmentStatus.ACTIVE },
      data: { status: SalesOrderStockFulfillmentStatus.REVERSED, ...data },
    });
  }

  static findActor(id: string, tx: Prisma.TransactionClient) {
    return tx.user.findUnique({ where: { id }, select: { fullName: true, username: true } });
  }
}
