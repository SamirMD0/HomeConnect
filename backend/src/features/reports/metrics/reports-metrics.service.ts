import { divideMoney, moneyToApiString, sumMoney, ZERO_MONEY } from '../../financial';
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
      records.salesByPaymentStatus.map((row) => row._sum.totalAmount ?? ZERO_MONEY)
    );
    const paidAmount = sumMoney(
      records.salesByPaymentStatus.map((row) => row._sum.paidAmount ?? ZERO_MONEY)
    );
    const unpaidAmount = sumMoney(
      records.salesByPaymentStatus.map((row) => row._sum.remainingAmount ?? ZERO_MONEY)
    );

    return {
      sales: {
        orderCount,
        totalAmount: moneyToApiString(totalAmount),
        paidAmount: moneyToApiString(paidAmount),
        unpaidAmount: moneyToApiString(unpaidAmount),
        averageOrderValue: moneyToApiString(
          orderCount === 0 ? ZERO_MONEY : divideMoney(totalAmount, String(orderCount))
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
