import { StockMovementType, SupplierReceivingItemStatus, SupplierReceivingStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import {
  moneyToApiString,
  parseBusinessDate,
  prismaDateToBusinessDate,
  splitBusinessDate,
  subtractMoney,
  sumMoney,
  todayInBusinessTimezone,
  ZERO_MONEY,
} from '../../financial';
import { addDays, differenceInDays } from '../../dashboard/shared/dashboard-range';
import { ReportsMetricsService } from '../metrics/reports-metrics.service';
import { MonthlyDebtsService } from '../monthly-debts/monthly-debts.service';
import { buildCsv, type CsvValue } from '../shared/csv';
import { buildAgingRows, summariseAging } from '../shared/receivables-aging';
import { resolveReportsPeriod } from '../shared/reports-period';
import { ReportRowsRepository } from './report-rows.repository';
import type { ReportSlice } from './report-rows.types';
import type { ReportRowsQueryInput } from './report-rows.validator';

interface ReportRowsOptions { businessDate?: string; generatedAt?: Date }

/** Payment gap beyond which a balance reads as genuinely stale, not merely late. */
const STALE_PAYMENT_DAYS = 60;
/** Balance at or above which a customer is called out regardless of payment behaviour. */
const HIGH_BALANCE = new Decimal('500.00');

export interface CustomerMovementRow {
  customer: { id: string; name: string; phone: string };
  openingBalance: string;
  newDebt: string;
  paidInPeriod: string;
  closingBalance: string;
  paymentCount: number;
  unpaidDebtCount: number;
  lastPaymentDate: string | null;
  daysSinceLastPayment: number | null;
  riskLabels: string[];
}

export class ReportRowsService {
  static async get(slice: ReportSlice, query: ReportRowsQueryInput, options: ReportRowsOptions = {}) {
    const businessDate = options.businessDate ?? todayInBusinessTimezone();
    const period = resolveReportsPeriod(query, businessDate);
    const generatedAt = (options.generatedAt ?? new Date()).toISOString();
    const data = await this.load(slice, period);
    return {
      meta: { ...period, generatedAt, currency: 'USD' as const },
      data,
    };
  }

  static async exportCsv(slice: ReportSlice, query: ReportRowsQueryInput, options: ReportRowsOptions = {}) {
    const report = await this.get(slice, query, options);
    const definition = csvDefinition(slice, report.data.rows as Array<Record<string, unknown>>);
    return {
      filename: `${slice}-${report.meta.from}-to-${report.meta.to}.csv`,
      csv: buildCsv(definition.headers, definition.rows),
    };
  }

  /**
   * Per-customer movement across the period: what they owed at the start, what
   * they took on, what they paid, and where they ended.
   *
   * Opening and closing balances come from the existing debt-snapshot service —
   * the single authority for "what was outstanding at a cutoff", including
   * installment plans — rather than being recomputed here. New debt and
   * payments come from the same service's activity view, so this report can
   * never disagree with the Customer Debts report about the same customer.
   */
  static async customerMovements(period: ReturnType<typeof resolveReportsPeriod>): Promise<CustomerMovementRow[]> {
    const dayBeforePeriod = addDays(parseBusinessDate(period.from), -1);
    const snapshotQuery = {
      month: period.from.slice(0, 7), mode: 'SNAPSHOT' as const, includeZero: true,
      includeCancelled: false, overdueOnly: false, page: 1, limit: 10000,
      sortBy: 'OUTSTANDING' as const, sortOrder: 'DESC' as const,
    };
    const [opening, closing, activity] = await Promise.all([
      MonthlyDebtsService.getDebtReportForRange(snapshotQuery, dayBeforePeriod, dayBeforePeriod),
      MonthlyDebtsService.getDebtReportForRange(snapshotQuery, period.from, period.to),
      MonthlyDebtsService.getFinancialActivityForRange(
        { month: period.from.slice(0, 7), page: 1, limit: 10000 }, period.from, period.to),
    ]);

    const openingByCustomer = new Map(opening.rows.map((row) => [row.customer.id, row]));
    const closingByCustomer = new Map(closing.rows.map((row) => [row.customer.id, row]));
    const activityByCustomer = new Map<string, { newDebt: Decimal; paid: Decimal; paymentCount: number }>();
    for (const item of activity.items) {
      const entry = activityByCustomer.get(item.customer.id) ?? { newDebt: ZERO_MONEY, paid: ZERO_MONEY, paymentCount: 0 };
      if (item.type === 'PAYMENT_RECEIVED') {
        entry.paid = sumMoney([entry.paid, new Decimal(item.amount)]);
        entry.paymentCount += 1;
      } else {
        entry.newDebt = sumMoney([entry.newDebt, new Decimal(item.amount)]);
      }
      activityByCustomer.set(item.customer.id, entry);
    }

    const customerIds = new Set([...openingByCustomer.keys(), ...closingByCustomer.keys(), ...activityByCustomer.keys()]);
    const rows: CustomerMovementRow[] = [];

    for (const customerId of customerIds) {
      const closingRow = closingByCustomer.get(customerId);
      const openingRow = openingByCustomer.get(customerId);
      const customer = closingRow?.customer ?? openingRow?.customer
        ?? activity.items.find((item) => item.customer.id === customerId)?.customer;
      if (!customer) continue;

      const entry = activityByCustomer.get(customerId) ?? { newDebt: ZERO_MONEY, paid: ZERO_MONEY, paymentCount: 0 };
      const openingBalance = new Decimal(openingRow?.totalOutstanding ?? '0.00');
      const closingBalance = new Decimal(closingRow?.totalOutstanding ?? '0.00');
      const lastPaymentDate = closingRow?.lastPaymentDate ?? openingRow?.lastPaymentDate ?? null;
      const daysSinceLastPayment = lastPaymentDate ? differenceInDays(lastPaymentDate, period.to) : null;

      // A customer with nothing owed and no activity is not part of this story.
      if (closingBalance.equals(ZERO_MONEY) && openingBalance.equals(ZERO_MONEY) && entry.paymentCount === 0) continue;

      rows.push({
        customer,
        openingBalance: moneyToApiString(openingBalance),
        newDebt: moneyToApiString(entry.newDebt),
        paidInPeriod: moneyToApiString(entry.paid),
        closingBalance: moneyToApiString(closingBalance),
        paymentCount: entry.paymentCount,
        unpaidDebtCount: (closingRow?.activeDebtCount ?? 0) + (closingRow?.activePlanCount ?? 0),
        lastPaymentDate,
        daysSinceLastPayment,
        riskLabels: riskLabelsFor({ entry, openingBalance, closingBalance, daysSinceLastPayment, lastPaymentDate }),
      });
    }

    return rows.sort((left, right) =>
      new Decimal(right.closingBalance).comparedTo(left.closingBalance)
      || left.customer.name.localeCompare(right.customer.name));
  }

  private static movementSummary(slice: ReportSlice, rows: CustomerMovementRow[]) {
    const total = (key: keyof CustomerMovementRow) =>
      moneyToApiString(sumMoney(rows.map((row) => new Decimal(row[key] as string))));
    return {
      count: rows.length,
      openingBalance: total('openingBalance'),
      newDebt: total('newDebt'),
      paidInPeriod: total('paidInPeriod'),
      closingBalance: total('closingBalance'),
      ...(slice === 'customers-paid'
        ? { paymentCount: rows.reduce((sum, row) => sum + row.paymentCount, 0) }
        : { withOldBalance: rows.filter((row) => row.riskLabels.includes('OLD_UNPAID_BALANCE')).length }),
    };
  }

  private static async load(slice: ReportSlice, period: ReturnType<typeof resolveReportsPeriod>) {
    if (slice === 'customers-new') {
      const records = await ReportRowsRepository.newCustomers(period);
      const rows = records.map((record) => ({
        id: record.id, name: record.name, phone: record.phone, isActive: record.isActive,
        createdOn: prismaDateToBusinessDate(record.createdAt),
      }));
      return { summary: { count: rows.length }, rows };
    }

    if (slice === 'customers-debts') {
      const report = await MonthlyDebtsService.getDebtReportForRange({
        month: period.from.slice(0, 7), mode: 'SNAPSHOT', includeZero: false,
        includeCancelled: false, overdueOnly: false, page: 1, limit: 10000,
        sortBy: 'OUTSTANDING', sortOrder: 'DESC',
      }, period.from, period.to);
      return { summary: report.summary, rows: report.rows };
    }

    if (slice === 'customers-payments') {
      const records = await ReportRowsRepository.customerPayments(period);
      const rows = records.map((record) => ({
        id: record.id, customer: record.customer, amount: moneyToApiString(record.totalAmount),
        paymentDate: prismaDateToBusinessDate(record.paymentDate), paymentMethod: record.paymentMethod,
        reference: record.reference, notes: record.notes, receivedBy: record.createdBy,
      }));
      return { summary: { count: rows.length, totalAmount: moneyToApiString(sumMoney(records.map((record) => record.totalAmount))) }, rows };
    }

    if (slice === 'customers-aging') {
      const nextDay = nextDayAfter(period.to);
      const debts = await ReportRowsRepository.openDebtsAsOf(nextDay);
      const rows = buildAgingRows(debts, period.to, nextDay);
      return { summary: { ...summariseAging(rows), asOf: period.to, scope: 'STANDARD_DEBTS_ONLY' }, rows };
    }

    if (slice === 'customers-not-paid' || slice === 'customers-paid') {
      const movements = await this.customerMovements(period);
      const rows = movements.filter((row) => (slice === 'customers-paid' ? row.paymentCount > 0 : row.paymentCount === 0));
      return { summary: this.movementSummary(slice, rows), rows };
    }

    if (slice === 'products-bought') {
      const [records, soldByProduct] = await Promise.all([
        ReportRowsRepository.receivedProducts(period),
        ReportRowsRepository.soldQuantityByProduct(period),
      ]);
      const rows = records.map((record) => {
        const reversed = record.status === SupplierReceivingItemStatus.REVERSED
          || record.receiving.status === SupplierReceivingStatus.VOIDED;
        return {
          itemId: record.id,
          product: record.product,
          sku: record.product.sku,
          barcode: record.product.barcode,
          currentStock: record.product.stockQuantity,
          supplier: record.receiving.supplier,
          receivingId: record.receiving.id,
          referenceNumber: record.receiving.referenceNumber,
          receivedOn: prismaDateToBusinessDate(record.receiving.receivedOn),
          receivedBy: record.receiving.receivedBy,
          quantity: record.quantity,
          // A reversed line still appears, marked, so a reader sees the receipt
          // was undone rather than finding it silently absent.
          status: reversed ? 'REVERSED' as const : 'ACTIVE' as const,
          receivingStatus: record.receiving.status,
          linkedDebt: record.receiving.transactions[0]
            ? { id: record.receiving.transactions[0].id, amount: moneyToApiString(record.receiving.transactions[0].amount) }
            : null,
          soldInPeriod: soldByProduct.get(record.product.id) ?? 0,
        };
      });
      const active = rows.filter((row) => row.status === 'ACTIVE');
      const unitsByProduct = new Map<string, { name: string; sku: string; units: number }>();
      const unitsBySupplier = new Map<string, { name: string; units: number }>();
      for (const row of active) {
        const product = unitsByProduct.get(row.product.id) ?? { name: row.product.name, sku: row.sku, units: 0 };
        unitsByProduct.set(row.product.id, { ...product, units: product.units + row.quantity });
        if (row.supplier) {
          const supplier = unitsBySupplier.get(row.supplier.id) ?? { name: row.supplier.name, units: 0 };
          unitsBySupplier.set(row.supplier.id, { ...supplier, units: supplier.units + row.quantity });
        }
      }
      return {
        summary: {
          count: rows.length,
          activeLines: active.length,
          reversedLines: rows.length - active.length,
          distinctProducts: unitsByProduct.size,
          totalUnits: active.reduce((total, row) => total + row.quantity, 0),
          receivedNotSold: active.filter((row) => row.soldInPeriod === 0).length,
          // Quantities only. Receiving carries no cost, so this report never
          // claims a purchase value.
          valuation: 'NOT_AVAILABLE' as const,
          topProducts: rank(unitsByProduct, (entry) => ({ name: entry.name, sku: entry.sku, units: entry.units })),
          topSuppliers: rank(unitsBySupplier, (entry) => ({ name: entry.name, units: entry.units })),
        },
        rows,
      };
    }

    if (slice === 'suppliers-debts') {
      const records = await ReportRowsRepository.supplierTransactions(period);
      const increases = records.filter((record) => record.direction === 'INCREASE_OWED').map((record) => record.amount);
      const decreases = records.filter((record) => record.direction === 'DECREASE_OWED').map((record) => record.amount);
      const rows = records.map((record) => ({
        ...record, amount: moneyToApiString(record.amount),
        transactionDate: prismaDateToBusinessDate(record.transactionDate),
      }));
      return {
        summary: {
          count: rows.length,
          increased: moneyToApiString(sumMoney(increases)),
          decreased: moneyToApiString(sumMoney(decreases)),
          netChange: moneyToApiString(subtractMoney(sumMoney(increases), sumMoney(decreases))),
        },
        rows,
      };
    }

    if (slice === 'suppliers-receiving') {
      const records = await ReportRowsRepository.supplierReceivings(period);
      const rows = records.map((record) => ({
        id: record.id, referenceNumber: record.referenceNumber,
        receivedOn: prismaDateToBusinessDate(record.receivedOn), status: record.status,
        supplier: record.supplier, receivedBy: record.receivedBy,
        lineCount: record.items.length,
        totalQuantity: record.items.reduce((total, item) => total + item.quantity, 0),
        linkedDebt: record.transactions[0] ? {
          id: record.transactions[0].id, amount: moneyToApiString(record.transactions[0].amount),
        } : null,
      }));
      return { summary: { count: rows.length, posted: rows.filter((row) => row.status === 'POSTED').length, voided: rows.filter((row) => row.status === 'VOIDED').length }, rows };
    }

    if (slice === 'sales-orders') {
      const [records, metrics] = await Promise.all([
        ReportRowsRepository.salesOrders(period),
        ReportsMetricsService.get(period),
      ]);
      const rows = records.map(serializeSalesOrder);
      return { summary: metrics.sales, rows };
    }

    if (slice === 'sales-unpaid') {
      const records = await ReportRowsRepository.unpaidSalesOrders();
      const rows = records.map(serializeSalesOrder);
      return {
        operationalSnapshot: true,
        summary: {
          count: rows.length,
          remainingAmount: moneyToApiString(sumMoney(records.map((record) => record.remainingAmount))),
        },
        rows,
      };
    }

    if (slice === 'inventory-movements') {
      const records = await ReportRowsRepository.stockMovements(period);
      const rows = records.map((record) => ({
        ...record, createdAt: record.createdAt.toISOString(),
      }));
      const movementsByType = Object.fromEntries(Object.values(StockMovementType).map((type) => [type, {
        count: records.filter((record) => record.movementType === type).length,
        quantityChange: records.filter((record) => record.movementType === type)
          .reduce((total, record) => total + record.quantityChange, 0),
      }]));
      return { summary: { count: rows.length, movementsByType }, rows };
    }

    const records = await ReportRowsRepository.receivingReconciliation(period);
    const rows = records.flatMap((receiving) => receiving.items.map((item) => {
      const issues = reconciliationIssues(receiving, item);
      return {
        receivingId: receiving.id, referenceNumber: receiving.referenceNumber,
        receivedOn: prismaDateToBusinessDate(receiving.receivedOn), receivingStatus: receiving.status,
        supplier: receiving.supplier, itemId: item.id, productId: item.productId,
        productName: item.product.name, sku: item.product.sku, quantity: item.quantity,
        itemStatus: item.status, movementId: item.stockMovement.id,
        reversalMovementId: item.reversalStockMovement?.id ?? null,
        status: issues.length === 0 ? 'OK' as const : 'MISMATCH' as const, issues,
      };
    }));
    return { summary: { count: rows.length, ok: rows.filter((row) => row.status === 'OK').length, mismatches: rows.filter((row) => row.status === 'MISMATCH').length }, rows };
  }
}

type SalesOrderRowRecord =
  | Awaited<ReturnType<typeof ReportRowsRepository.salesOrders>>[number]
  | Awaited<ReturnType<typeof ReportRowsRepository.unpaidSalesOrders>>[number];

function serializeSalesOrder(record: SalesOrderRowRecord) {
  return {
    ...record, orderDate: prismaDateToBusinessDate(record.orderDate),
    totalAmount: moneyToApiString(record.totalAmount), paidAmount: moneyToApiString(record.paidAmount),
    remainingAmount: moneyToApiString(record.remainingAmount),
  };
}

function reconciliationIssues(
  receiving: Awaited<ReturnType<typeof ReportRowsRepository.receivingReconciliation>>[number],
  item: Awaited<ReturnType<typeof ReportRowsRepository.receivingReconciliation>>[number]['items'][number]
) {
  const issues: string[] = [];
  const original = item.stockMovement;
  if (original.movementType !== StockMovementType.PURCHASE_RECEIPT) issues.push('Original movement type is not PURCHASE_RECEIPT');
  if (original.productId !== item.productId) issues.push('Original movement product does not match receiving item');
  if (original.quantityChange !== item.quantity) issues.push('Original movement quantity does not match receiving item');
  if (original.referenceType !== 'SUPPLIER_RECEIVING_ITEM' || original.referenceId !== item.id) issues.push('Original movement reference does not match receiving item');

  const expectsReversal = receiving.status === SupplierReceivingStatus.VOIDED || item.status === SupplierReceivingItemStatus.REVERSED;
  const reversal = item.reversalStockMovement;
  if (expectsReversal && !reversal) issues.push('Voided or reversed item has no reversal movement');
  if (!expectsReversal && reversal) issues.push('Active posted item unexpectedly has a reversal movement');
  if (reversal) {
    if (reversal.movementType !== StockMovementType.PURCHASE_RECEIPT_REVERSAL) issues.push('Reversal movement type is not PURCHASE_RECEIPT_REVERSAL');
    if (reversal.productId !== item.productId) issues.push('Reversal movement product does not match receiving item');
    if (reversal.quantityChange !== -item.quantity) issues.push('Reversal movement quantity does not offset receiving item');
    if (reversal.referenceType !== 'SUPPLIER_RECEIVING_ITEM' || reversal.referenceId !== item.id) issues.push('Reversal movement reference does not match receiving item');
  }
  return issues;
}

function csvDefinition(slice: ReportSlice, rows: Array<Record<string, unknown>>): { headers: CsvValue[]; rows: CsvValue[][] } {
  const definitions: Record<ReportSlice, { headers: string[]; values: (row: Record<string, unknown>) => CsvValue[] }> = {
    'customers-new': { headers: ['Date', 'Customer', 'Phone', 'Active'], values: (r) => [r.createdOn as string, r.name as string, r.phone as string, r.isActive as boolean] },
    'customers-debts': { headers: ['Customer', 'Phone', 'Outstanding', 'Due by cutoff', 'Overdue', 'Last payment'], values: (r) => { const c = r.customer as Record<string, unknown>; return [c.name as string, c.phone as string, r.totalOutstanding as string, r.amountDueByCutoff as string, r.overdueAmountAtCutoff as string, r.lastPaymentDate as string | null]; } },
    'customers-payments': { headers: ['Date', 'Customer', 'Phone', 'Amount', 'Method', 'Reference'], values: (r) => { const c = r.customer as Record<string, unknown>; return [r.paymentDate as string, c.name as string, c.phone as string, r.amount as string, r.paymentMethod as string, r.reference as string | null]; } },
    'customers-aging': { headers: ['Customer', 'Phone', 'Reference', 'Created', 'Due', 'Original', 'Paid', 'Remaining', 'Days unpaid', 'Bucket', 'Last payment', 'Status'], values: (r) => { const c = r.customer as Record<string, unknown>; return [c.name as string, c.phone as string, r.reference as string | null, r.createdOn as string, r.dueDate as string, r.originalAmount as string, r.paidAmount as string, r.remainingAmount as string, r.daysUnpaid as number, r.bucket as string, r.lastPaymentDate as string | null, r.status as string]; } },
    'customers-not-paid': { headers: movementCsvHeaders, values: movementCsvRow },
    'customers-paid': { headers: movementCsvHeaders, values: movementCsvRow },
    'products-bought': { headers: ['Date', 'SKU', 'Product', 'Supplier', 'Reference', 'Quantity', 'Current stock', 'Sold in period', 'Line status', 'Received by', 'Linked debt'], values: (r) => { const p = r.product as Record<string, unknown>; const s = r.supplier as Record<string, unknown> | null; const b = r.receivedBy as Record<string, unknown> | null; const d = r.linkedDebt as Record<string, unknown> | null; return [r.receivedOn as string, p.sku as string, p.name as string, s?.name as string | undefined, r.referenceNumber as string | null, r.quantity as number, r.currentStock as number, r.soldInPeriod as number, r.status as string, b?.fullName as string | undefined, d?.amount as string | undefined]; } },
    'suppliers-debts': { headers: ['Date', 'Supplier', 'Type', 'Direction', 'Amount', 'Description', 'Reference', 'Receipt'], values: (r) => { const s = r.supplier as Record<string, unknown>; return [r.transactionDate as string, s.name as string, r.type as string, r.direction as string, r.amount as string, r.description as string, r.reference as string | null, r.receiptNumber as string | null]; } },
    'suppliers-receiving': { headers: ['Date', 'Supplier', 'Reference', 'Status', 'Lines', 'Quantity', 'Linked debt'], values: (r) => { const s = r.supplier as Record<string, unknown> | null; const d = r.linkedDebt as Record<string, unknown> | null; return [r.receivedOn as string, s?.name as string | undefined, r.referenceNumber as string | null, r.status as string, r.lineCount as number, r.totalQuantity as number, d?.amount as string | undefined]; } },
    'sales-orders': { headers: ['Date', 'Order', 'Customer', 'Payment status', 'Fulfillment', 'Total', 'Paid', 'Remaining'], values: salesCsvRow },
    'sales-unpaid': { headers: ['Date', 'Order', 'Customer', 'Payment status', 'Fulfillment', 'Total', 'Paid', 'Remaining'], values: salesCsvRow },
    'inventory-movements': { headers: ['Timestamp', 'SKU', 'Product', 'Type', 'Change', 'Before', 'After', 'Reason', 'Reference'], values: (r) => { const p = r.product as Record<string, unknown>; return [r.createdAt as string, p.sku as string, p.name as string, r.movementType as string, r.quantityChange as number, r.quantityBefore as number, r.quantityAfter as number, r.reason as string, r.referenceId as string | null]; } },
    'inventory-reconciliation': { headers: ['Date', 'Receiving', 'Supplier', 'SKU', 'Product', 'Quantity', 'Status', 'Issues'], values: (r) => { const s = r.supplier as Record<string, unknown> | null; return [r.receivedOn as string, r.referenceNumber as string | null, s?.name as string | undefined, r.sku as string, r.productName as string, r.quantity as number, r.status as string, (r.issues as string[]).join('; ')]; } },
  };
  const definition = definitions[slice];
  return { headers: definition.headers, rows: rows.map(definition.values) };
}

const movementCsvHeaders = ['Customer', 'Phone', 'Opening', 'New debt', 'Paid', 'Closing', 'Payments', 'Unpaid items', 'Last payment', 'Days since payment', 'Risk'];

function movementCsvRow(row: Record<string, unknown>): CsvValue[] {
  const customer = row.customer as Record<string, unknown>;
  return [
    customer.name as string, customer.phone as string, row.openingBalance as string,
    row.newDebt as string, row.paidInPeriod as string, row.closingBalance as string,
    row.paymentCount as number, row.unpaidDebtCount as number,
    row.lastPaymentDate as string | null, row.daysSinceLastPayment as number | null,
    (row.riskLabels as string[]).join('; '),
  ];
}

function nextDayAfter(businessDate: string): Date {
  const { year, month, day } = splitBusinessDate(businessDate);
  return new Date(Date.UTC(year, month - 1, day + 1));
}

function rank<T>(entries: Map<string, T>, project: (entry: T) => { units: number } & Record<string, unknown>, limit = 5) {
  return [...entries.entries()]
    .map(([id, entry]) => ({ id, ...project(entry) }))
    .sort((left, right) => right.units - left.units)
    .slice(0, limit);
}

/** Deterministic, explainable labels — no scoring, no AI. */
function riskLabelsFor(input: {
  entry: { newDebt: Decimal; paid: Decimal; paymentCount: number };
  openingBalance: Decimal;
  closingBalance: Decimal;
  daysSinceLastPayment: number | null;
  lastPaymentDate: string | null;
}): string[] {
  const labels: string[] = [];
  const owesMoney = input.closingBalance.greaterThan(ZERO_MONEY);
  if (owesMoney && input.entry.paymentCount === 0) labels.push('NO_PAYMENT_THIS_PERIOD');
  if (owesMoney && (input.lastPaymentDate === null || (input.daysSinceLastPayment ?? 0) > STALE_PAYMENT_DAYS)) {
    labels.push('OLD_UNPAID_BALANCE');
  }
  if (input.closingBalance.greaterThan(input.openingBalance)) labels.push('DEBT_INCREASED');
  if (input.closingBalance.greaterThanOrEqualTo(HIGH_BALANCE)) labels.push('HIGH_BALANCE');
  return labels;
}

function salesCsvRow(row: Record<string, unknown>): CsvValue[] {
  const customer = row.customer as Record<string, unknown> | null;
  return [row.orderDate as string, row.orderNumber as string, customer?.name as string | undefined, row.paymentStatus as string, row.fulfillmentStatus as string, row.totalAmount as string, row.paidAmount as string, row.remainingAmount as string];
}
