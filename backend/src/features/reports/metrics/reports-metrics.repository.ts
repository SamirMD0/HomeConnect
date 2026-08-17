import { SalesOrderFulfillmentStatus } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { businessDateToPrisma } from '../../financial';
import { addDays } from '../../dashboard/shared/dashboard-range';
import type { ResolvedReportsPeriod } from '../shared/reports-period';

const EXCLUDED_SALES_STATUSES = [
  SalesOrderFulfillmentStatus.DRAFT,
  SalesOrderFulfillmentStatus.CANCELLED,
  SalesOrderFulfillmentStatus.RETURNED,
];

export class ReportsMetricsRepository {
  static async load(period: ResolvedReportsPeriod) {
    const from = businessDateToPrisma(period.from);
    const toExclusive = businessDateToPrisma(addDays(period.to, 1));
    const activeCustomerWhere = { deletedAt: null, isActive: true } as const;

    const [newCustomers, activeCustomers, payers, salesByPaymentStatus] = await Promise.all([
      prisma.customer.count({
        where: { deletedAt: null, createdAt: { gte: from, lt: toExclusive } },
      }),
      prisma.customer.findMany({
        where: activeCustomerWhere,
        select: { id: true, name: true, phone: true },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
      }),
      prisma.payment.findMany({
        where: {
          customer: activeCustomerWhere,
          paymentDate: { gte: from, lt: toExclusive },
          // A payment voided after the cutoff was still valid inside the report period.
          OR: [{ voidedAt: null }, { voidedAt: { gte: toExclusive } }],
        },
        select: { customerId: true },
        distinct: ['customerId'],
      }),
      prisma.salesOrder.groupBy({
        by: ['paymentStatus'],
        where: {
          fulfillmentStatus: { notIn: EXCLUDED_SALES_STATUSES },
          orderDate: { gte: from, lt: toExclusive },
        },
        _count: { _all: true },
        _sum: { totalAmount: true, paidAmount: true, remainingAmount: true },
        orderBy: { paymentStatus: 'asc' },
      }),
    ]);

    return { newCustomers, activeCustomers, payers, salesByPaymentStatus };
  }
}

export type ReportsMetricRecords = Awaited<ReturnType<typeof ReportsMetricsRepository.load>>;
