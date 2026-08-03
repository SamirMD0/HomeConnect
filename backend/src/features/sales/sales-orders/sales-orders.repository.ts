import {
  Prisma,
  SalesChannel,
  SalesOrderFulfillmentStatus,
  SalesOrderPaymentStatus,
} from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { businessDateToPrisma } from '../../financial/domain/business-date';
import { nextSalesOrderNumber } from '../domain/order-number';
import type { SalesOrderListQueryInput } from './sales-orders.validator';

export const salesOrderInclude = {
  customer: { select: { id: true, name: true, phone: true, address: true, isActive: true } },
  items: {
    include: {
      product: {
        select: {
          id: true,
          name: true,
          model: true,
          sku: true,
          barcode: true,
          isActive: true,
          trackStock: true,
          stockQuantity: true,
          lowStockThreshold: true,
          costPrice: true,
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  },
  debt: { select: { id: true, status: true, originalAmount: true, dueDate: true } },
  installmentPlan: { select: { id: true, status: true, totalAmount: true, startDate: true } },
  createdBy: { select: { id: true, fullName: true, username: true } },
  updatedBy: { select: { id: true, fullName: true, username: true } },
  cancelledBy: { select: { id: true, fullName: true, username: true } },
} satisfies Prisma.SalesOrderInclude;

export type SalesOrderRecord = Prisma.SalesOrderGetPayload<{ include: typeof salesOrderInclude }>;

export class SalesOrdersRepository {
  static findById(id: string, tx?: Prisma.TransactionClient) {
    return (tx ?? prisma).salesOrder.findUnique({ where: { id }, include: salesOrderInclude });
  }

  static findItemById(id: string, tx: Prisma.TransactionClient) {
    return tx.salesOrderItem.findUnique({ where: { id }, include: { product: true } });
  }

  static findActiveCustomer(id: string, tx: Prisma.TransactionClient) {
    return tx.customer.findFirst({ where: { id, isActive: true, deletedAt: null } });
  }

  static findActiveProduct(id: string, tx: Prisma.TransactionClient) {
    return tx.product.findFirst({ where: { id, isActive: true } });
  }

  static findActor(id: string, tx: Prisma.TransactionClient) {
    return tx.user.findUnique({ where: { id }, select: { fullName: true, username: true } });
  }

  static async nextOrderNumber(year: number, tx: Prisma.TransactionClient) {
    const latest = await tx.salesOrder.findFirst({
      where: { orderNumber: { startsWith: `SO-${year}-` } },
      orderBy: { orderNumber: 'desc' },
      select: { orderNumber: true },
    });
    return nextSalesOrderNumber(year, latest?.orderNumber);
  }

  static create(data: Prisma.SalesOrderUncheckedCreateInput, tx: Prisma.TransactionClient) {
    return tx.salesOrder.create({ data, include: salesOrderInclude });
  }

  static update(id: string, data: Prisma.SalesOrderUncheckedUpdateInput, tx: Prisma.TransactionClient) {
    return tx.salesOrder.update({ where: { id }, data, include: salesOrderInclude });
  }

  static addItem(data: Prisma.SalesOrderItemUncheckedCreateInput, tx: Prisma.TransactionClient) {
    return tx.salesOrderItem.create({ data, include: { product: true } });
  }

  static updateItem(id: string, data: Prisma.SalesOrderItemUncheckedUpdateInput, tx: Prisma.TransactionClient) {
    return tx.salesOrderItem.update({ where: { id }, data, include: { product: true } });
  }

  static removeItem(id: string, tx: Prisma.TransactionClient) {
    return tx.salesOrderItem.delete({ where: { id } });
  }

  static async list(query: SalesOrderListQueryInput) {
    const where = buildWhere(query);
    const [items, total] = await Promise.all([
      prisma.salesOrder.findMany({
        where,
        include: salesOrderInclude,
        orderBy: buildOrder(query.sort),
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.salesOrder.count({ where }),
    ]);
    return { items, total };
  }

  static async summary(today: Date, tomorrow: Date) {
    const counted = {
      notIn: [
        SalesOrderFulfillmentStatus.DRAFT,
        SalesOrderFulfillmentStatus.CANCELLED,
        SalesOrderFulfillmentStatus.RETURNED,
      ],
    };
    const [todayAggregate, pendingDelivery, unpaidOrders, partialPayments] = await Promise.all([
      prisma.salesOrder.aggregate({
        where: { orderDate: { gte: today, lt: tomorrow }, fulfillmentStatus: counted },
        _sum: { totalAmount: true },
        _count: { _all: true },
      }),
      prisma.salesOrder.count({
        where: {
          salesChannel: { in: [SalesChannel.SHOP_DELIVERY, SalesChannel.PHONE_ORDER] },
          fulfillmentStatus: {
            in: [
              SalesOrderFulfillmentStatus.CONFIRMED,
              SalesOrderFulfillmentStatus.PREPARING,
              SalesOrderFulfillmentStatus.READY_FOR_DELIVERY,
              SalesOrderFulfillmentStatus.OUT_FOR_DELIVERY,
            ],
          },
        },
      }),
      prisma.salesOrder.count({
        where: { paymentStatus: SalesOrderPaymentStatus.UNPAID, fulfillmentStatus: counted },
      }),
      prisma.salesOrder.count({
        where: { paymentStatus: SalesOrderPaymentStatus.PARTIALLY_PAID, fulfillmentStatus: counted },
      }),
    ]);
    return { todayAggregate, pendingDelivery, unpaidOrders, partialPayments };
  }
}

function buildWhere(query: SalesOrderListQueryInput): Prisma.SalesOrderWhereInput {
  return {
    ...(query.customerId ? { customerId: query.customerId } : {}),
    ...(query.salesChannel ? { salesChannel: { in: query.salesChannel } } : {}),
    ...(query.fulfillmentStatus ? { fulfillmentStatus: { in: query.fulfillmentStatus } } : {}),
    ...(query.paymentStatus ? { paymentStatus: { in: query.paymentStatus } } : {}),
    ...(query.settlement ? { settlement: { in: query.settlement } } : {}),
    ...(query.dateFrom || query.dateTo ? {
      orderDate: {
        ...(query.dateFrom ? { gte: businessDateToPrisma(query.dateFrom) } : {}),
        ...(query.dateTo ? { lte: businessDateToPrisma(query.dateTo) } : {}),
      },
    } : {}),
    ...(query.search ? {
      OR: [
        { orderNumber: { contains: query.search, mode: 'insensitive' } },
        { customer: { name: { contains: query.search, mode: 'insensitive' } } },
        { customer: { phone: { contains: query.search, mode: 'insensitive' } } },
        { items: { some: { productNameSnapshot: { contains: query.search, mode: 'insensitive' } } } },
        { items: { some: { skuSnapshot: { contains: query.search, mode: 'insensitive' } } } },
      ],
    } : {}),
  };
}

function buildOrder(sort: SalesOrderListQueryInput['sort']): Prisma.SalesOrderOrderByWithRelationInput[] {
  if (sort === 'createdAsc') return [{ orderDate: 'asc' }, { createdAt: 'asc' }];
  if (sort === 'customerAsc') return [{ customer: { name: 'asc' } }, { orderDate: 'desc' }];
  if (sort === 'totalDesc') return [{ totalAmount: 'desc' }, { orderDate: 'desc' }];
  return [{ orderDate: 'desc' }, { createdAt: 'desc' }];
}
