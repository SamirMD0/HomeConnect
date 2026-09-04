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

export interface CustomerFinancialIntegrityEvidence {
  customerId: string;
  customerName: string;
  customerPhone: string;
  obligationTotal: string;
  allocationTotal: string;
  obligationCount: number;
  allocationCount: number;
}

export interface SupplierFinancialIntegrityEvidence {
  supplierId: string;
  supplierName: string;
  supplierPhone: string;
  increaseTotal: string;
  decreaseTotal: string;
  transactionCount: number;
}

export interface ProductCostChangeEvidence {
  auditId: string;
  changedAt: Date;
  productId: string;
  productName: string;
  productSku: string;
  oldCost: string | null;
  newCost: string | null;
  costSource: string | null;
  supplierTransactionId: string | null;
  supplierReceivingId: string | null;
  receiptNumber: string | null;
  changedByName: string;
  changedByUsername: string;
  reason: string;
}

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

  static productCostChanges(period: ResolvedReportsPeriod) {
    const { from, toExclusive } = boundaries(period);
    return prisma.$queryRaw<ProductCostChangeEvidence[]>`
      SELECT
        audit."id" AS "auditId",
        audit."changedAt",
        audit."recordId" AS "productId",
        COALESCE(product."name", 'Unknown product') AS "productName",
        COALESCE(product."sku", '—') AS "productSku",
        audit."beforeValues" ->> 'costPrice' AS "oldCost",
        audit."afterValues" ->> 'costPrice' AS "newCost",
        audit."afterValues" ->> 'costSource' AS "costSource",
        audit."afterValues" ->> 'supplierTransactionId' AS "supplierTransactionId",
        audit."afterValues" ->> 'supplierReceivingId' AS "supplierReceivingId",
        audit."afterValues" ->> 'receiptNumber' AS "receiptNumber",
        audit."changedByName",
        audit."changedByUsername",
        audit."reason"
      FROM "service_audits" audit
      LEFT JOIN "products" product ON product."id" = audit."recordId"
      WHERE audit."recordType" = 'PRODUCT'
        AND audit."action" = 'CHANGE_PRICE'
        AND (audit."beforeValues" ? 'costPrice' OR audit."afterValues" ? 'costPrice')
        AND audit."changedAt" >= ${from}
        AND audit."changedAt" < ${toExclusive}
      ORDER BY audit."changedAt" ASC, audit."id" ASC
    `;
  }

  /**
   * Independent customer-balance evidence.
   *
   * This deliberately does not call any financial-domain balance helper used by
   * customer screens. It treats each standard debt and each live installment as
   * an obligation, then subtracts only allocations whose allocation row and
   * parent payment are both live. Keeping this SQL separate is what lets the
   * report catch a regression in the normal application projection.
   */
  static customerFinancialIntegrity() {
    return prisma.$queryRaw<CustomerFinancialIntegrityEvidence[]>`
      WITH obligation_rows AS (
        SELECT d."customerId", d."originalAmount" AS amount
        FROM "debts" d
        WHERE d."kind" <> 'PREPAID_PURCHASE'
          AND d."status" <> 'CANCELLED'
          AND d."cancelledAt" IS NULL
        UNION ALL
        SELECT p."customerId", i."amountDue" AS amount
        FROM "installments" i
        JOIN "installment_plans" p ON p."id" = i."installmentPlanId"
        WHERE p."status" <> 'CANCELLED'
          AND p."cancelledAt" IS NULL
          AND i."status" <> 'CANCELLED'
      ),
      obligation_totals AS (
        SELECT "customerId", SUM(amount) AS amount, COUNT(*)::integer AS count
        FROM obligation_rows
        GROUP BY "customerId"
      ),
      allocation_rows AS (
        SELECT d."customerId", a."amount"
        FROM "payment_allocations" a
        JOIN "payments" payment ON payment."id" = a."paymentId"
        JOIN "debts" d ON d."id" = a."debtId"
        WHERE a."voidedAt" IS NULL
          AND payment."voidedAt" IS NULL
          AND d."kind" <> 'PREPAID_PURCHASE'
          AND d."status" <> 'CANCELLED'
          AND d."cancelledAt" IS NULL
        UNION ALL
        SELECT p."customerId", a."amount"
        FROM "payment_allocations" a
        JOIN "payments" payment ON payment."id" = a."paymentId"
        JOIN "installments" i ON i."id" = a."installmentId"
        JOIN "installment_plans" p ON p."id" = i."installmentPlanId"
        WHERE a."voidedAt" IS NULL
          AND payment."voidedAt" IS NULL
          AND p."status" <> 'CANCELLED'
          AND p."cancelledAt" IS NULL
          AND i."status" <> 'CANCELLED'
      ),
      allocation_totals AS (
        SELECT "customerId", SUM(amount) AS amount, COUNT(*)::integer AS count
        FROM allocation_rows
        GROUP BY "customerId"
      )
      SELECT
        customer."id" AS "customerId",
        customer."name" AS "customerName",
        customer."phone" AS "customerPhone",
        COALESCE(obligations.amount, 0)::text AS "obligationTotal",
        COALESCE(allocations.amount, 0)::text AS "allocationTotal",
        COALESCE(obligations.count, 0)::integer AS "obligationCount",
        COALESCE(allocations.count, 0)::integer AS "allocationCount"
      FROM "customers" customer
      LEFT JOIN obligation_totals obligations ON obligations."customerId" = customer."id"
      LEFT JOIN allocation_totals allocations ON allocations."customerId" = customer."id"
      WHERE customer."deletedAt" IS NULL
      ORDER BY customer."name" ASC, customer."id" ASC
    `;
  }

  /** Independent direction-and-status aggregation for every supplier. */
  static supplierFinancialIntegrity() {
    return prisma.$queryRaw<SupplierFinancialIntegrityEvidence[]>`
      WITH transaction_totals AS (
        SELECT
          st."supplierId",
          COALESCE(SUM(st."amount") FILTER (
            WHERE st."status" = 'ACTIVE' AND st."direction" = 'INCREASE_OWED'
          ), 0) AS increases,
          COALESCE(SUM(st."amount") FILTER (
            WHERE st."status" = 'ACTIVE' AND st."direction" = 'DECREASE_OWED'
          ), 0) AS decreases,
          COUNT(*) FILTER (WHERE st."status" = 'ACTIVE')::integer AS count
        FROM "supplier_transactions" st
        GROUP BY st."supplierId"
      )
      SELECT
        supplier."id" AS "supplierId",
        supplier."name" AS "supplierName",
        supplier."phone" AS "supplierPhone",
        COALESCE(totals.increases, 0)::text AS "increaseTotal",
        COALESCE(totals.decreases, 0)::text AS "decreaseTotal",
        COALESCE(totals.count, 0)::integer AS "transactionCount"
      FROM "suppliers" supplier
      LEFT JOIN transaction_totals totals ON totals."supplierId" = supplier."id"
      ORDER BY supplier."name" ASC, supplier."id" ASC
    `;
  }
}
