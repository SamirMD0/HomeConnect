import { Decimal } from '@prisma/client/runtime/library';
import { moneyToApiString, subtractMoney, todayInBusinessTimezone, ZERO_MONEY } from '../../financial';
import { buildCsv } from '../shared/csv';
import { resolveReportsPeriod } from '../shared/reports-period';
import { REPORTS_RISK_THRESHOLDS } from '../shared/reports-risk.config';
import { MonthlyReviewService } from '../monthly-review/monthly-review.service';
import { ReportRowsRepository } from '../rows/report-rows.repository';
import type { MonthlyReviewEnvelope } from '../monthly-review/monthly-review.types';
import type { MonthlyReviewQueryInput } from '../monthly-review/monthly-review.validator';
import type { AnalysisComparison, AnalysisEnvelope, AnalysisFinding } from './analysis.types';

interface AnalysisOptions { businessDate?: string; generatedAt?: Date }

/**
 * The analysis portal: the same period read against the one before it.
 *
 * Every figure here is produced by an existing service — this composes, it does
 * not compute financial truth of its own. Its only original work is comparison
 * and the deterministic findings below, which are plain threshold rules with
 * named constants. No scoring, no AI, no invented numbers.
 */
export class AnalysisService {
  static async get(query: MonthlyReviewQueryInput, options: AnalysisOptions = {}): Promise<AnalysisEnvelope> {
    const businessDate = options.businessDate ?? todayInBusinessTimezone();
    const generatedAt = (options.generatedAt ?? new Date()).toISOString();
    const period = resolveReportsPeriod(query, businessDate);
    const previousQuery = { period: 'custom' as const, from: period.previousFrom, to: period.previousTo };

    const [current, previous, received, previousReceived, soldByProduct, previousSold] = await Promise.all([
      MonthlyReviewService.get(query, { businessDate, generatedAt: options.generatedAt }),
      MonthlyReviewService.get(previousQuery, { businessDate, generatedAt: options.generatedAt }),
      ReportRowsRepository.receivedQuantityTotal(period),
      ReportRowsRepository.receivedQuantityTotal({ ...period, from: period.previousFrom, to: period.previousTo }),
      ReportRowsRepository.soldQuantityByProduct(period),
      ReportRowsRepository.soldQuantityByProduct({ ...period, from: period.previousFrom, to: period.previousTo }),
    ]);

    const receivedProducts = await ReportRowsRepository.receivedProducts(period);
    const receivedProductIds = new Set(receivedProducts.map((item) => item.product.id));
    const receivedNotSoldProducts = [...receivedProductIds].filter((id) => (soldByProduct.get(id) ?? 0) === 0).length;
    const receivingWithoutLinkedDebt = new Set(
      receivedProducts.filter((item) => item.receiving.transactions.length === 0).map((item) => item.receiving.id)
    ).size;

    const soldUnits = sumMapValues(soldByProduct);
    const previousSoldUnits = sumMapValues(previousSold);
    const data = this.compose(current, previous, {
      received, previousReceived, soldUnits, previousSoldUnits,
      receivedNotSoldProducts, receivingWithoutLinkedDebt,
    });

    return { meta: { ...current.meta, generatedAt }, data };
  }

  static async exportCsv(query: MonthlyReviewQueryInput, options: AnalysisOptions = {}) {
    const report = await this.get(query, options);
    const { health, cashflow, inventoryPosition } = report.data;
    const comparisons: Array<[string, AnalysisComparison]> = [
      ['Sales', health.salesTotal], ['Customer debt added', health.customerDebtAdded],
      ['Customer collected', health.customerCollected], ['Supplier debt added', health.supplierDebtAdded],
      ['Supplier paid', health.supplierPaid], ['Customer receivables', health.customerReceivables],
      ['Supplier payables', health.supplierPayables],
    ];
    return {
      filename: `analysis-${report.meta.from}-to-${report.meta.to}.csv`,
      csv: buildCsv(
        ['Measure', 'Current', 'Previous', 'Change', 'Change %'],
        [
          ...comparisons.map(([label, value]) => [label, value.current, value.previous, value.change, value.changePercent]),
          ['Orders', health.orderCount.current, health.orderCount.previous, health.orderCount.change, null],
          ['Inventory received (units)', health.inventoryReceivedUnits.current, health.inventoryReceivedUnits.previous, health.inventoryReceivedUnits.change, null],
          ['Inventory sold (units)', health.inventorySoldUnits.current, health.inventorySoldUnits.previous, health.inventorySoldUnits.change, null],
          ['Unpaid customer amount', cashflow.unpaidCustomerAmount, null, null, null],
          ['Supplier amount owed', cashflow.supplierAmountOwed, null, null, null],
          ['Products received but not sold', inventoryPosition.receivedNotSoldProducts, null, null, null],
        ]
      ),
    };
  }

  private static compose(
    current: MonthlyReviewEnvelope,
    previous: MonthlyReviewEnvelope,
    counts: {
      received: { units: number; lines: number };
      previousReceived: { units: number; lines: number };
      soldUnits: number;
      previousSoldUnits: number;
      receivedNotSoldProducts: number;
      receivingWithoutLinkedDebt: number;
    }
  ): AnalysisEnvelope['data'] {
    const now = current.data;
    const before = previous.data;
    const inventory = now.inventory.operationalSnapshot.summary;

    const health = {
      salesTotal: compare(now.sales.totalAmount, before.sales.totalAmount),
      orderCount: countCompare(now.sales.orderCount, before.sales.orderCount),
      customerDebtAdded: compare(now.customers.movement.newAmount, before.customers.movement.newAmount),
      customerCollected: compare(now.customers.movement.collected, before.customers.movement.collected),
      supplierDebtAdded: compare(now.suppliers.movement.newAmount, before.suppliers.movement.newAmount),
      supplierPaid: compare(now.suppliers.movement.collected, before.suppliers.movement.collected),
      customerReceivables: compare(now.customers.movement.closing, before.customers.movement.closing),
      supplierPayables: compare(now.suppliers.movement.closing, before.suppliers.movement.closing),
      inventoryReceivedUnits: countCompare(counts.received.units, counts.previousReceived.units),
      inventorySoldUnits: countCompare(counts.soldUnits, counts.previousSoldUnits),
    };

    const customerDebtGrowth = subtractMoney(now.customers.movement.closing, before.customers.movement.closing);
    const supplierDebtGrowth = subtractMoney(now.suppliers.movement.closing, before.suppliers.movement.closing);
    const collections = new Decimal(now.customers.movement.collected);
    const supplierPayments = new Decimal(now.suppliers.movement.collected);

    const cashflow = {
      customerDebtGrowth: moneyToApiString(customerDebtGrowth),
      supplierDebtGrowth: moneyToApiString(supplierDebtGrowth),
      collections: moneyToApiString(collections),
      supplierPayments: moneyToApiString(supplierPayments),
      netCollectionPosition: moneyToApiString(subtractMoney(collections, supplierPayments)),
      unpaidCustomerAmount: now.sales.unpaidAmount,
      supplierAmountOwed: now.suppliers.operationalSnapshot.owed,
      supplierDebtOutrunningCollections: supplierDebtGrowth.greaterThan(collections),
      collectionShortfall: collections.lessThan(new Decimal(now.customers.movement.newAmount)),
    };

    const receivables = new Decimal(now.customers.movement.closing);
    const topDebtors = now.customers.operationalSnapshot.topDebtors
      .slice(0, 5)
      .map((debtor) => ({ customerId: debtor.customerId, customerName: debtor.customerName, outstanding: debtor.outstanding }));

    const salesTotal = new Decimal(now.sales.totalAmount);
    const data: AnalysisEnvelope['data'] = {
      health,
      cashflow,
      salesVsDebt: {
        orderCount: now.sales.orderCount,
        paidAmount: now.sales.paidAmount,
        unpaidAmount: now.sales.unpaidAmount,
        unpaidPercentOfSales: salesTotal.greaterThan(ZERO_MONEY)
          ? round(new Decimal(now.sales.unpaidAmount).dividedBy(salesTotal).times(100))
          : null,
        topDebtors,
      },
      supplierPosition: {
        owed: now.suppliers.operationalSnapshot.owed,
        suppliersWithBalance: now.suppliers.operationalSnapshot.suppliersWithBalance,
        paidInPeriod: now.suppliers.movement.collected,
        topBalances: now.suppliers.operationalSnapshot.topBalances.slice(0, 5).map((entry) => ({
          supplierId: entry.supplierId, supplierName: entry.supplierName, balance: entry.balance,
        })),
        receivingWithoutLinkedDebt: counts.receivingWithoutLinkedDebt,
      },
      inventoryPosition: {
        receivedUnits: counts.received.units,
        receivedLines: counts.received.lines,
        soldUnits: counts.soldUnits,
        lowStockProducts: inventory.lowStockProducts,
        outOfStockProducts: inventory.outOfStockProducts,
        receivedNotSoldProducts: counts.receivedNotSoldProducts,
        ordersAwaitingStockDeduction: inventory.ordersAwaitingStockDeduction,
      },
      findings: [],
    };

    data.findings = buildFindings(data, { receivables, topDebtor: topDebtors[0] });
    return data;
  }
}

function buildFindings(
  data: AnalysisEnvelope['data'],
  context: { receivables: Decimal; topDebtor?: { customerName: string; outstanding: string } }
): AnalysisFinding[] {
  const findings: AnalysisFinding[] = [];
  const { health, cashflow, inventoryPosition, supplierPosition } = data;

  if (percentGap(health.customerDebtAdded, health.salesTotal) > REPORTS_RISK_THRESHOLDS.debtOutrunningSalesGrowthGapPercent) {
    findings.push(finding('CUSTOMER_DEBT_OUTRUNNING_SALES', 'warning',
      'Customer debt grew faster than sales', 'ديون الزبائن نمت أسرع من المبيعات',
      `New customer debt ${health.customerDebtAdded.current} against sales ${health.salesTotal.current}.`,
      `دين جديد ${health.customerDebtAdded.current} مقابل مبيعات ${health.salesTotal.current}.`));
  }

  if (cashflow.supplierDebtOutrunningCollections) {
    findings.push(finding('SUPPLIER_DEBT_OUTRUNNING_COLLECTIONS', 'serious',
      'Supplier debt grew faster than collections', 'ديون الموردين نمت أسرع من التحصيل',
      `Supplier debt rose by ${cashflow.supplierDebtGrowth} while collections were ${cashflow.collections}. This may create cash pressure.`,
      `ارتفع دين الموردين بمقدار ${cashflow.supplierDebtGrowth} بينما بلغ التحصيل ${cashflow.collections}. قد يسبب ضغطًا نقديًا.`));
  }

  if (cashflow.collectionShortfall) {
    findings.push(finding('COLLECTION_SHORTFALL', 'warning',
      'Collected less than newly owed', 'التحصيل أقل من الدين الجديد',
      `Collected ${cashflow.collections} against ${health.customerDebtAdded.current} of new debt.`,
      `تم تحصيل ${cashflow.collections} مقابل ${health.customerDebtAdded.current} دين جديد.`));
  }

  if (context.topDebtor && context.receivables.greaterThan(ZERO_MONEY)) {
    const share = new Decimal(context.topDebtor.outstanding).dividedBy(context.receivables).times(100);
    if (share.greaterThan(REPORTS_RISK_THRESHOLDS.customerReceivableConcentrationPercent)) {
      findings.push(finding('RECEIVABLE_CONCENTRATION', 'warning',
        'One customer holds most of the receivable', 'زبون واحد يملك معظم الذمم',
        `${context.topDebtor.customerName} owes ${context.topDebtor.outstanding}, ${round(share)}% of all receivables.`,
        `${context.topDebtor.customerName} مدين بمبلغ ${context.topDebtor.outstanding}، أي ${round(share)}% من إجمالي الذمم.`));
    }
  }

  if (inventoryPosition.receivedNotSoldProducts > 0) {
    findings.push(finding('RECEIVED_NOT_SOLD', 'info',
      'Products received but not sold', 'منتجات استُلمت ولم تُبع',
      `${inventoryPosition.receivedNotSoldProducts} product(s) were received this period with no sale movement.`,
      `${inventoryPosition.receivedNotSoldProducts} منتج استُلم هذه الفترة دون أي حركة بيع.`));
  }

  if (inventoryPosition.outOfStockProducts > 0) {
    findings.push(finding('OUT_OF_STOCK', 'serious',
      'Products are out of stock', 'منتجات نفدت من المخزون',
      `${inventoryPosition.outOfStockProducts} product(s) are at zero stock.`,
      `${inventoryPosition.outOfStockProducts} منتج بلا مخزون.`));
  } else if (inventoryPosition.lowStockProducts > 0) {
    findings.push(finding('LOW_STOCK', 'warning',
      'Products are below their low-stock threshold', 'منتجات تحت حد المخزون المنخفض',
      `${inventoryPosition.lowStockProducts} product(s) need restocking.`,
      `${inventoryPosition.lowStockProducts} منتج يحتاج إعادة تخزين.`));
  }

  if (inventoryPosition.ordersAwaitingStockDeduction > 0) {
    findings.push(finding('ORDERS_AWAITING_STOCK_DEDUCTION', 'warning',
      'Orders are waiting for stock deduction', 'طلبات تنتظر خصم المخزون',
      `${inventoryPosition.ordersAwaitingStockDeduction} order(s) have not had stock deducted.`,
      `${inventoryPosition.ordersAwaitingStockDeduction} طلب لم يُخصم مخزونه بعد.`));
  }

  if (supplierPosition.receivingWithoutLinkedDebt > 0) {
    findings.push(finding('RECEIVING_WITHOUT_LINKED_DEBT', 'info',
      'Goods received with no supplier bill recorded', 'بضاعة مستلمة بدون فاتورة مورد',
      `${supplierPosition.receivingWithoutLinkedDebt} receiving document(s) have no linked supplier debt. This is valid if the goods were prepaid or free.`,
      `${supplierPosition.receivingWithoutLinkedDebt} مستند استلام بلا دين مورد مرتبط. هذا مقبول إذا كانت البضاعة مدفوعة مسبقًا أو مجانية.`));
  }

  return findings;
}

function finding(key: string, severity: AnalysisFinding['severity'], labelEn: string, labelAr: string, detailEn: string, detailAr: string): AnalysisFinding {
  return { key, severity, label: { en: labelEn, ar: labelAr }, detail: { en: detailEn, ar: detailAr } };
}

function compare(current: string, previous: string): AnalysisComparison {
  const currentValue = new Decimal(current);
  const previousValue = new Decimal(previous);
  const change = subtractMoney(currentValue, previousValue);
  return {
    current: moneyToApiString(currentValue),
    previous: moneyToApiString(previousValue),
    change: moneyToApiString(change),
    changePercent: previousValue.equals(ZERO_MONEY) ? null : round(change.dividedBy(previousValue).times(100)),
  };
}

function countCompare(current: number, previous: number) {
  return { current, previous, change: current - previous };
}

/** Growth of one measure minus growth of another, in percentage points. */
function percentGap(left: AnalysisComparison, right: AnalysisComparison): number {
  if (left.changePercent === null || right.changePercent === null) return 0;
  return left.changePercent - right.changePercent;
}

function round(value: Decimal): number {
  return Number(value.toDecimalPlaces(1).toString());
}

function sumMapValues(values: Map<string, number>): number {
  let total = 0;
  for (const value of values.values()) total += value;
  return total;
}
