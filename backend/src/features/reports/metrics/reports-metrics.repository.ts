import { scopeWhere, type BranchScope } from '../../branches/branch-scope';
import { SalesOrderFulfillmentStatus } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { businessDateToPrisma } from '../../financial';
import { addDays } from '../../dashboard/shared/dashboard-range';
import type { ResolvedReportsPeriod } from '../shared/reports-period';

const EXCLUDED_SALES_STATUSES = [
  SalesOrderFulfillmentStatus.DRAFT,
  SalesOrderFulfillmentStatus.CANCELLED,
];

export class ReportsMetricsRepository {
  static async load(period: ResolvedReportsPeriod, scope: BranchScope) {
    const from = businessDateToPrisma(period.from);
    const toExclusive = businessDateToPrisma(addDays(period.to, 1));
    const activeCustomerWhere = { deletedAt: null, isActive: true } as const;

    const [newCustomers, activeCustomers, payers, salesByPaymentStatus, returns] = await Promise.all([
      prisma.customer.count({
        where: { ...scopeWhere(scope),  deletedAt: null, createdAt: { gte: from, lt: toExclusive } },
      }),
      prisma.customer.findMany({
        where: { ...scopeWhere(scope), ...activeCustomerWhere },
        select: { id: true, name: true, phone: true },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
      }),
      prisma.payment.findMany({
        where: { ...scopeWhere(scope),
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
        where: { ...scopeWhere(scope),
          fulfillmentStatus: { notIn: EXCLUDED_SALES_STATUSES },
          orderDate: { gte: from, lt: toExclusive },
        },
        _count: { _all: true },
        _sum: { baseTotalAmount: true, basePaidAmount: true, baseRemainingAmount: true },
        orderBy: { paymentStatus: 'asc' },
      }),
      prisma.salesReturn.findMany({
        where: { ...scopeWhere(scope),  returnDate: { gte: from, lt: toExclusive } },
        select: { baseTotalIncVat: true, baseReceivableReliefAmount: true, baseRefundableAmount: true, refundMethod: true },
      }),
    ]);

    return { newCustomers, activeCustomers, payers, salesByPaymentStatus, returns };
  }
}

export type ReportsMetricRecords = Awaited<ReturnType<typeof ReportsMetricsRepository.load>>;
