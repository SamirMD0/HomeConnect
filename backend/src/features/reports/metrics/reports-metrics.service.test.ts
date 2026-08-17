import { SalesOrderPaymentStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { describe, expect, it } from 'vitest';
import { ReportsMetricsService } from './reports-metrics.service';

describe('ReportsMetricsService', () => {
  it('computes backend-authoritative sales totals without combining payment statuses in the frontend', () => {
    const result = ReportsMetricsService.aggregate(records({
      salesByPaymentStatus: [
        salesGroup(SalesOrderPaymentStatus.PAID, 2, '300.00', '300.00', '0.00'),
        salesGroup(SalesOrderPaymentStatus.PARTIALLY_PAID, 1, '200.00', '50.00', '150.00'),
        salesGroup(SalesOrderPaymentStatus.UNPAID, 1, '100.00', '0.00', '100.00'),
      ],
    }));

    expect(result.sales).toEqual({
      orderCount: 4,
      totalAmount: '600.00',
      paidAmount: '350.00',
      unpaidAmount: '250.00',
      averageOrderValue: '150.00',
    });
    expect(Object.values(result.sales).filter((value) => typeof value === 'number')).toEqual([4]);
  });

  it('returns did-not-pay as the exact complement of distinct active-customer payers', () => {
    const result = ReportsMetricsService.aggregate(records({
      newCustomers: 2,
      activeCustomers: [customer('c1', 'Ali'), customer('c2', 'Maya'), customer('c3', 'Nour')],
      payers: [{ customerId: 'c2' }, { customerId: 'c2' }],
    }));

    expect(result.customers).toEqual({
      newCustomers: 2,
      activeCustomers: 3,
      paidCount: 1,
      didNotPayCount: 2,
      didNotPay: [customer('c1', 'Ali'), customer('c3', 'Nour')],
    });
    expect(result.customers.paidCount + result.customers.didNotPayCount)
      .toBe(result.customers.activeCustomers);
  });

  it('returns zero money strings rather than nulls for an empty period', () => {
    expect(ReportsMetricsService.aggregate(records()).sales).toEqual({
      orderCount: 0,
      totalAmount: '0.00',
      paidAmount: '0.00',
      unpaidAmount: '0.00',
      averageOrderValue: '0.00',
    });
  });
});

function records(overrides: Record<string, unknown> = {}) {
  return {
    newCustomers: 0,
    activeCustomers: [],
    payers: [],
    salesByPaymentStatus: [],
    ...overrides,
  } as never;
}

function customer(id: string, name: string) {
  return { id, name, phone: `${id}-phone` };
}

function salesGroup(
  paymentStatus: SalesOrderPaymentStatus,
  count: number,
  totalAmount: string,
  paidAmount: string,
  remainingAmount: string
) {
  return {
    paymentStatus,
    _count: { _all: count },
    _sum: {
      totalAmount: new Decimal(totalAmount),
      paidAmount: new Decimal(paidAmount),
      remainingAmount: new Decimal(remainingAmount),
    },
  };
}
