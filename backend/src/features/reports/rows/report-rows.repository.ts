import {
  DebtKind,
  SalesOrderFulfillmentStatus,
  SalesOrderPaymentStatus,
  StockMovementType,
  SupplierReceivingItemStatus,
  SupplierTransactionStatus,
} from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { businessDateToPrisma } from '../../financial';
import { addDays } from '../../dashboard/shared/dashboard-range';
import type { ResolvedReportsPeriod } from '../shared/reports-period';

const excludedSalesStatuses = [
  SalesOrderFulfillmentStatus.DRAFT,
  SalesOrderFulfillmentStatus.CANCELLED,
  SalesOrderFulfillmentStatus.RETURNED,
];

function boundaries(period: ResolvedReportsPeriod) {
  return {
    from: businessDateToPrisma(period.from),
    toExclusive: businessDateToPrisma(addDays(period.to, 1)),
  };
}

export class ReportRowsRepository {
  static newCustomers(period: ResolvedReportsPeriod) {
    const { from, toExclusive } = boundaries(period);
    return prisma.customer.findMany({
      where: { deletedAt: null, createdAt: { gte: from, lt: toExclusive } },
      select: { id: true, name: true, phone: true, isActive: true, createdAt: true },
      orderBy: [{ createdAt: 'asc' }, { name: 'asc' }, { id: 'asc' }],
    });
  }

  static customerPayments(period: ResolvedReportsPeriod) {
    const { from, toExclusive } = boundaries(period);
    return prisma.payment.findMany({
      where: {
        paymentDate: { gte: from, lt: toExclusive },
        OR: [{ voidedAt: null }, { voidedAt: { gte: toExclusive } }],
      },
      select: {
        id: true, totalAmount: true, paymentDate: true, paymentMethod: true,
        reference: true, notes: true,
        customer: { select: { id: true, name: true, phone: true } },
        createdBy: { select: { fullName: true, username: true } },
      },
      orderBy: [{ paymentDate: 'asc' }, { id: 'asc' }],
    });
  }

  static supplierTransactions(period: ResolvedReportsPeriod) {
    const { from, toExclusive } = boundaries(period);
    return prisma.supplierTransaction.findMany({
      where: { status: SupplierTransactionStatus.ACTIVE, transactionDate: { gte: from, lt: toExclusive } },
      select: {
        id: true, type: true, direction: true, amount: true, transactionDate: true,
        description: true, reference: true, receiptNumber: true, supplierReceivingId: true,
        supplier: { select: { id: true, name: true, companyName: true } },
      },
      orderBy: [{ transactionDate: 'asc' }, { id: 'asc' }],
    });
  }

  static supplierReceivings(period: ResolvedReportsPeriod) {
    const { from, toExclusive } = boundaries(period);
    return prisma.supplierReceiving.findMany({
      where: { receivedOn: { gte: from, lt: toExclusive } },
      select: {
        id: true, referenceNumber: true, receivedOn: true, status: true,
        supplier: { select: { id: true, name: true } },
        receivedBy: { select: { fullName: true, username: true } },
        items: { select: { quantity: true }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
        transactions: {
          where: { status: SupplierTransactionStatus.ACTIVE },
          select: { id: true, amount: true }, take: 1,
        },
      },
      orderBy: [{ receivedOn: 'asc' }, { id: 'asc' }],
    });
  }

  static salesOrders(period: ResolvedReportsPeriod) {
    const { from, toExclusive } = boundaries(period);
    return prisma.salesOrder.findMany({
      where: {
        orderDate: { gte: from, lt: toExclusive },
        fulfillmentStatus: { notIn: excludedSalesStatuses },
      },
      select: {
        id: true, orderNumber: true, orderDate: true, salesChannel: true,
        fulfillmentStatus: true, paymentStatus: true, settlement: true,
        totalAmount: true, paidAmount: true, remainingAmount: true,
        customer: { select: { id: true, name: true, phone: true } },
      },
      orderBy: [{ orderDate: 'asc' }, { orderNumber: 'asc' }],
    });
  }

  static unpaidSalesOrders() {
    return prisma.salesOrder.findMany({
      where: {
        paymentStatus: { in: [SalesOrderPaymentStatus.UNPAID, SalesOrderPaymentStatus.PARTIALLY_PAID] },
        fulfillmentStatus: { notIn: excludedSalesStatuses },
      },
      select: {
        id: true, orderNumber: true, orderDate: true, paymentStatus: true,
        fulfillmentStatus: true, totalAmount: true, paidAmount: true, remainingAmount: true,
        customer: { select: { id: true, name: true, phone: true } },
      },
      orderBy: [{ orderDate: 'asc' }, { orderNumber: 'asc' }],
    });
  }

  static stockMovements(period: ResolvedReportsPeriod) {
    const { from, toExclusive } = boundaries(period);
    return prisma.stockMovement.findMany({
      where: { createdAt: { gte: from, lt: toExclusive } },
      select: {
        id: true, movementType: true, quantityChange: true, quantityBefore: true,
        quantityAfter: true, reason: true, note: true, referenceType: true,
        referenceId: true, createdAt: true,
        product: { select: { id: true, name: true, sku: true } },
        createdBy: { select: { fullName: true, username: true } },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  }

  /**
   * Every standard debt raised on or before the cutoff, with the allocations
   * needed to work out what is still owed.
   *
   * PREPAID_PURCHASE is excluded to match the existing debt reports — a prepaid
   * purchase is money already taken, not a receivable. Cancelled debts are
   * dropped by the service once it knows whether the cancellation happened
   * before the cutoff.
   */
  static openDebtsAsOf(cutoffExclusive: Date) {
    return prisma.debt.findMany({
      where: {
        kind: { not: DebtKind.PREPAID_PURCHASE },
        customer: { deletedAt: null },
        createdAt: { lt: cutoffExclusive },
      },
      select: {
        id: true, description: true, originalAmount: true, dueDate: true,
        status: true, createdAt: true, cancelledAt: true,
        customer: { select: { id: true, name: true, phone: true } },
        salesOrder: { select: { id: true, orderNumber: true } },
        paymentAllocations: {
          select: {
            amount: true,
            payment: { select: { paymentDate: true, voidedAt: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  }

  /** Every non-voided payment on or before the cutoff, for last-payment dates. */
  static paymentsThrough(cutoffExclusive: Date) {
    return prisma.payment.findMany({
      where: {
        customer: { deletedAt: null },
        paymentDate: { lt: cutoffExclusive },
        OR: [{ voidedAt: null }, { voidedAt: { gte: cutoffExclusive } }],
      },
      select: {
        id: true, totalAmount: true, paymentDate: true,
        customer: { select: { id: true, name: true, phone: true } },
      },
      orderBy: [{ paymentDate: 'asc' }, { id: 'asc' }],
    });
  }

  /**
   * Received product lines in the period.
   *
   * Reversed lines and voided documents are kept and flagged rather than
   * filtered out, so a reader can see that a receipt was undone instead of
   * finding it silently missing. The service excludes them from the totals.
   */
  static receivedProducts(period: ResolvedReportsPeriod) {
    const { from, toExclusive } = boundaries(period);
    return prisma.supplierReceivingItem.findMany({
      where: { receiving: { receivedOn: { gte: from, lt: toExclusive } } },
      select: {
        id: true, quantity: true, status: true,
        product: { select: { id: true, name: true, sku: true, barcode: true, stockQuantity: true } },
        stockMovement: { select: { id: true, movementType: true, quantityChange: true } },
        reversalStockMovement: { select: { id: true } },
        receiving: {
          select: {
            id: true, referenceNumber: true, receivedOn: true, status: true,
            supplier: { select: { id: true, name: true } },
            receivedBy: { select: { fullName: true, username: true } },
            transactions: {
              where: { status: SupplierTransactionStatus.ACTIVE },
              select: { id: true, amount: true }, take: 1,
            },
          },
        },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  }

  /** Quantity sold per product in the period, for "received but never sold". */
  static async soldQuantityByProduct(period: ResolvedReportsPeriod) {
    const { from, toExclusive } = boundaries(period);
    const rows = await prisma.stockMovement.groupBy({
      by: ['productId'],
      where: {
        movementType: StockMovementType.SALE_FULFILLMENT,
        createdAt: { gte: from, lt: toExclusive },
      },
      _sum: { quantityChange: true },
    });
    return new Map(rows.map((row) => [row.productId, Math.abs(row._sum.quantityChange ?? 0)]));
  }

  /** Active received units per product in the period, for the analysis portal. */
  static async receivedQuantityTotal(period: ResolvedReportsPeriod) {
    const { from, toExclusive } = boundaries(period);
    const result = await prisma.supplierReceivingItem.aggregate({
      where: {
        status: SupplierReceivingItemStatus.ACTIVE,
        receiving: { receivedOn: { gte: from, lt: toExclusive } },
      },
      _sum: { quantity: true },
      _count: { _all: true },
    });
    return { units: result._sum.quantity ?? 0, lines: result._count._all };
  }

  static receivingReconciliation(period: ResolvedReportsPeriod) {
    const { from, toExclusive } = boundaries(period);
    return prisma.supplierReceiving.findMany({
      where: { receivedOn: { gte: from, lt: toExclusive } },
      select: {
        id: true, referenceNumber: true, receivedOn: true, status: true,
        supplier: { select: { id: true, name: true } },
        items: {
          select: {
            id: true, quantity: true, status: true, productId: true,
            product: { select: { name: true, sku: true } },
            stockMovement: {
              select: { id: true, productId: true, movementType: true, quantityChange: true, referenceType: true, referenceId: true },
            },
            reversalStockMovement: {
              select: { id: true, productId: true, movementType: true, quantityChange: true, referenceType: true, referenceId: true },
            },
          },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        },
      },
      orderBy: [{ receivedOn: 'asc' }, { id: 'asc' }],
    });
  }
}
