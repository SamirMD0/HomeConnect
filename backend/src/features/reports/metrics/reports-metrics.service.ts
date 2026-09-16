import { Decimal } from '@prisma/client/runtime/library';
import { Currency } from '@prisma/client';
import { divideMoney, moneyToApiString, sumMoney, subtractMoney, ZERO_MONEY } from '../../financial';
import { ReportsMetricsRepository, type ReportsMetricRecords } from './reports-metrics.repository';
import type { ReportsCoreMetrics } from './reports-metrics.types';
import type { ResolvedReportsPeriod } from '../shared/reports-period';

export class ReportsMetricsService {
  static async get(period: ResolvedReportsPeriod): Promise<ReportsCoreMetrics> {
    return this.aggregate(await ReportsMetricsRepository.load(period));
  }

  static aggregate(records: ReportsMetricRecords): ReportsCoreMetrics {
    const payerIds = new Set(records.payers.map((payer) => payer.customerId));
    const didNotPay = records.activeCustomers.filter((customer) => !payerIds.has(customer.id));
    const orderCount = records.salesByPaymentStatus.reduce(
      (total, row) => total + row._count._all,
      0
    );
    const totalAmount = sumMoney(
      records.salesByPaymentStatus.map((row) => row._sum.baseTotalAmount ?? ZERO_MONEY)
    );
    const paidAmount = sumMoney(
      records.salesByPaymentStatus.map((row) => row._sum.basePaidAmount ?? ZERO_MONEY)
    );
    const unpaidAmount = sumMoney(
      records.salesByPaymentStatus.map((row) => row._sum.baseRemainingAmount ?? ZERO_MONEY)
    );

    const returns = records.returns ?? [];
    const returnsAmount = sumMoney(returns.map((record) => record.baseTotalIncVat));
    const cashRefunds = sumMoney(returns.filter((record) => record.refundMethod === 'CASH_OUT').map((record) => record.baseRefundableAmount));
    const storeCreditIssued = sumMoney(returns.filter((record) => record.refundMethod === 'STORE_CREDIT').map((record) => record.baseRefundableAmount));
    return {
      sales: {
        orderCount,
        returnsAmount: moneyToApiString(returnsAmount),
        cashRefunds: moneyToApiString(cashRefunds),
        storeCreditIssued: moneyToApiString(storeCreditIssued),
        netSalesAmount: moneyToApiString(subtractMoney(totalAmount, returnsAmount)),
        totalAmount: moneyToApiString(totalAmount),
        paidAmount: moneyToApiString(paidAmount),
        unpaidAmount: moneyToApiString(unpaidAmount),
        averageOrderValue: moneyToApiString(
          orderCount === 0 ? ZERO_MONEY : divideMoney(totalAmount, String(orderCount), Currency.USD, Decimal.ROUND_HALF_UP)
        ),
      },
      customers: {
        newCustomers: records.newCustomers,
        activeCustomers: records.activeCustomers.length,
        paidCount: records.activeCustomers.length - didNotPay.length,
        didNotPayCount: didNotPay.length,
        didNotPay,
      },
    };
  }
}
