/**
 * Report columns and summary figures, as plain data, for every report.
 *
 * Mirrors frontend/src/features/reports/components/report-columns.tsx (the
 * PC's tables) and MonthlyDebtReportTable / MonthlyActivityReportTable, so
 * the phone shows the same useful columns in the same order instead of every
 * raw field. A frontend test (report-columns-parity.test.ts) fails when the
 * labels drift apart.
 *
 * Money is formatted, never summed or derived: every figure is the PC's own.
 */
import { formatBusinessDate, formatDateTime, formatMoney } from './money-format';

export type CellTone = 'good' | 'bad' | 'warn' | 'info';
export interface Cell {
  text: string;
  tone?: CellTone;
}

type Row = Record<string, unknown>;

export type ColumnKind =
  | { kind: 'text'; key: string }
  | { kind: 'money'; key: string; nullable?: boolean; currencyKey?: string }
  | { kind: 'count'; key: string }
  | { kind: 'signed'; key: string }
  | { kind: 'signedMoney'; key: string }
  | { kind: 'percent'; key: string; signedTone?: boolean }
  | { kind: 'margin'; key: string }
  | { kind: 'nested'; parent: string; key: string; money?: boolean }
  | { kind: 'party'; key: string; walkIn?: boolean }
  | { kind: 'product' }
  | { kind: 'category' }
  | { kind: 'status'; key: string; good?: string[]; bad?: string[] }
  | { kind: 'changed'; key: string }
  | { kind: 'aging'; key: string }
  | { kind: 'ageBand'; key: string }
  | { kind: 'supplierDue'; key: string }
  | { kind: 'risk'; key: string }
  | { kind: 'issues'; key: string };

export type ReportColumnSpec = ColumnKind & {
  label: string;
  /** Right-aligned, tabular figures. */
  numeric?: boolean;
  /** Width hint in dp for the phone table. */
  width?: number;
};

const text = (label: string, key: string): ReportColumnSpec => ({ label, kind: 'text', key });
const money = (label: string, key: string): ReportColumnSpec => ({ label, kind: 'money', key, numeric: true });
const nullableMoney = (label: string, key: string): ReportColumnSpec => ({ label, kind: 'money', key, nullable: true, numeric: true });
const count = (label: string, key: string): ReportColumnSpec => ({ label, kind: 'count', key, numeric: true });
const signed = (label: string, key: string): ReportColumnSpec => ({ label, kind: 'signed', key, numeric: true });
const signedMoney = (label: string, key: string): ReportColumnSpec => ({ label, kind: 'signedMoney', key, numeric: true });
const percentage = (label: string, key: string): ReportColumnSpec => ({ label, kind: 'percent', key, signedTone: true, numeric: true });
const nestedText = (label: string, parent: string, key: string): ReportColumnSpec => ({ label, kind: 'nested', parent, key });
const nestedMoney = (label: string, parent: string, key: string): ReportColumnSpec => ({ label, kind: 'nested', parent, key, money: true, numeric: true });
const party = (label: string, key: string): ReportColumnSpec => ({ label, kind: 'party', key, walkIn: key === 'customer', width: 170 });
const partyText = (label: string, key: string): ReportColumnSpec => ({ label, kind: 'party', key, width: 170 });
const status = (label: string, key: string, good: string[]): ReportColumnSpec => ({ label, kind: 'status', key, good });
const category = (): ReportColumnSpec => ({ label: 'Category (current catalogue)', kind: 'category', width: 160 });
const product = (): ReportColumnSpec[] => [{ label: 'Product', kind: 'product', width: 190 }, nestedText('SKU', 'product', 'sku')];
const margin = (): ReportColumnSpec => ({ label: 'Margin', kind: 'margin', key: 'marginPercent', numeric: true });
const issues = (): ReportColumnSpec => ({ label: 'Issues', kind: 'issues', key: 'issues', width: 220 });

const supplierMovement = (): ReportColumnSpec[] => [
  party('Supplier', 'supplier'), nestedText('Phone', 'supplier', 'phone'),
  money('Owed at start', 'openingBalance'), money('New bills', 'billed'), money('Paid', 'paid'),
  money('Credits', 'credits'), money('Owed now', 'closingBalance'), count('Payments', 'paymentCount'),
  text('Last payment', 'lastPaymentDate'),
];

/** Columns per report slice. `monthly-debts` / `monthly-activity` are the two older monthly reports. */
export function reportColumns(slice: string): ReportColumnSpec[] {
  switch (slice) {
    case 'sales-summary': return [text('Date', 'date'), count('Orders', 'orderCount'), money('Gross sales', 'grossSales'), money('Returns', 'returns'), money('Net sales', 'netSales'), money('Collected', 'collected'), money('Left unpaid', 'leftUnpaid')];
    case 'sales-by-product': return [...product(), count('Units sold', 'unitsSold'), count('Returned', 'unitsReturned'), money('Sales (ex VAT)', 'salesExVat'), money('VAT', 'vat'), money('Returns', 'returns'), money('Net sales', 'netSales'), nullableMoney('Avg price', 'averagePrice')];
    case 'profit': return [...product(), count('Net units', 'netUnits'), money('Net sales (ex VAT)', 'netSales'), nullableMoney('Unit cost', 'unitCost'), nullableMoney('Cost of goods', 'costOfGoods'), nullableMoney('Gross profit', 'grossProfit'), margin()];
    case 'sales-by-customer': return [party('Customer', 'customer'), nestedText('Phone', 'customer', 'phone'), count('Orders', 'orderCount'), money('Sales', 'sales'), money('Paid', 'paid'), money('Still owed', 'stillOwed'), { label: 'Share of sales', kind: 'percent', key: 'shareOfSales', numeric: true }, text('Last order', 'lastOrderDate')];
    case 'cash-flow': return [text('Date', 'date'), money('From customers', 'customerPayments'), money('To suppliers', 'supplierPayments'), money('Refunds', 'customerRefunds'), money('Money in', 'moneyIn'), money('Money out', 'moneyOut'), signedMoney('Net cash flow', 'netCashFlow'), signedMoney('Running total', 'cumulativeNet')];
    case 'inventory-valuation': return [...product(), count('On hand', 'onHand'), nullableMoney('Unit cost', 'unitCost'), nullableMoney('Stock value (cost)', 'stockValue'), nullableMoney('Unit price', 'unitPrice'), nullableMoney('Retail value', 'retailValue')];
    case 'inventory-low-stock': return [...product(), count('On hand', 'onHand'), count('Reorder level', 'reorderLevel'), count('Sold in period', 'soldInPeriod'), count('Suggested order', 'suggestedOrder'), nullableMoney('Estimated cost', 'estimatedCost'), { label: 'Status', kind: 'status', key: 'status', bad: ['OUT_OF_STOCK'] }];
    case 'suppliers-paid':
    case 'suppliers-not-paid': return supplierMovement();
    case 'customers-new': return [text('Date', 'createdOn'), text('Customer', 'name'), text('Phone', 'phone'), text('Status', 'isActive')];
    case 'customers-debts': return [party('Customer', 'customer'), money('Outstanding', 'totalOutstanding'), money('Due', 'amountDueByCutoff'), money('Overdue', 'overdueAmountAtCutoff'), text('Last payment', 'lastPaymentDate')];
    case 'customers-payments': return [text('Date', 'paymentDate'), party('Customer', 'customer'), { label: 'Amount', kind: 'money', key: 'amount', currencyKey: 'currency', numeric: true }, text('Currency', 'currency'), text('Method', 'paymentMethod'), text('Reference', 'reference')];
    case 'customers-aging': return [party('Customer', 'customer'), nestedText('Phone', 'customer', 'phone'), text('Reference', 'reference'), text('Created', 'createdOn'), money('Original', 'originalAmount'), money('Paid', 'paidAmount'), money('Remaining', 'remainingAmount'), count('Days unpaid', 'daysUnpaid'), { label: 'Age', kind: 'aging', key: 'bucket' }, text('Last payment', 'lastPaymentDate'), status('Status', 'status', ['PARTIALLY_PAID'])];
    case 'customers-not-paid':
    case 'customers-paid': return [party('Customer', 'customer'), nestedText('Phone', 'customer', 'phone'), money('Opening', 'openingBalance'), money('New debt', 'newDebt'), money('Return credits', 'returnCredits'), money('Paid', 'paidInPeriod'), money('Closing', 'closingBalance'), count('Payments', 'paymentCount'), count('Unpaid items', 'unpaidDebtCount'), text('Last payment', 'lastPaymentDate'), count('Days since', 'daysSinceLastPayment'), { label: 'Risk', kind: 'risk', key: 'riskLabels', width: 200 }];
    case 'products-bought': return [category(), text('Date', 'receivedOn'), nestedText('Product', 'product', 'name'), text('SKU', 'sku'), party('Supplier', 'supplier'), text('Reference', 'referenceNumber'), count('Received', 'quantity'), count('Current stock', 'currentStock'), count('Sold in period', 'soldInPeriod'), status('Line', 'status', ['ACTIVE']), nestedMoney('Linked bill', 'linkedDebt', 'amount')];
    case 'products-cost-changes': return [category(), text('Changed', 'changedAt'), partyText('Product', 'product'), nestedText('SKU', 'product', 'sku'), nullableMoney('Old cost', 'oldCost'), nullableMoney('New cost', 'newCost'), nullableMoney('Old selling', 'oldSellingPrice'), nullableMoney('New selling', 'newSellingPrice'), text('Pricing mode', 'sellingPriceSource'), { label: 'Selling changed', kind: 'changed', key: 'sellingPriceChanged' }, percentage('Change', 'percentageChange'), text('Source', 'source'), text('Receipt', 'receiptNumber'), nestedText('Changed by', 'changedBy', 'fullName'), text('Reason', 'reason')];
    case 'suppliers-debts': return [text('Date', 'transactionDate'), party('Supplier', 'supplier'), text('Type', 'type'), text('Direction', 'direction'), money('Amount', 'amount'), text('Description', 'description'), text('Receipt', 'receiptNumber')];
    case 'suppliers-aging': return [party('Supplier', 'supplier'), text('Receipt', 'receiptNumber'), text('Due date', 'dueDate'), text('Currency', 'currency'), text('Original transaction', 'transactionAmount'), money('Original USD', 'originalAmount'), money('FIFO settled USD', 'fifoSettledAmount'), money('Remaining USD', 'remainingAmount'), count('Days overdue', 'daysOverdue'), { label: 'Age band', kind: 'ageBand', key: 'bucket' }, { label: 'Status', kind: 'supplierDue', key: 'status' }];
    case 'suppliers-receiving': return [text('Date', 'receivedOn'), party('Supplier', 'supplier'), text('Reference', 'referenceNumber'), status('Status', 'status', ['POSTED']), count('Lines', 'lineCount'), count('Quantity', 'totalQuantity'), nestedMoney('Linked debt', 'linkedDebt', 'amount')];
    case 'sales-orders':
    case 'sales-unpaid': return [text('Order', 'orderNumber'), text('Date', 'orderDate'), partyText('Customer', 'customer'), status('Payment', 'paymentStatus', ['PAID']), text('Fulfillment', 'fulfillmentStatus'), money('Total', 'totalAmount'), money('Paid', 'paidAmount'), money('Remaining', 'remainingAmount')];
    case 'inventory-movements': return [category(), text('Timestamp', 'createdAt'), partyText('Product', 'product'), nestedText('SKU', 'product', 'sku'), text('Type', 'movementType'), signed('Change', 'quantityChange'), count('Before', 'quantityBefore'), count('After', 'quantityAfter'), text('Reason', 'reason')];
    case 'customers-financial-integrity': return [party('Customer', 'customer'), nestedText('Phone', 'customer', 'phone'), money('Obligations', 'obligationTotal'), money('Allocations', 'allocationTotal'), money('Reported', 'reportedOutstanding'), money('Independent', 'independentOutstanding'), money('Difference', 'difference'), status('Result', 'status', ['OK']), issues()];
    case 'suppliers-financial-integrity': return [party('Supplier', 'supplier'), nestedText('Phone', 'supplier', 'phone'), money('Increases', 'increaseTotal'), money('Decreases', 'decreaseTotal'), money('Reported', 'reportedBalance'), money('Independent', 'independentBalance'), money('Difference', 'difference'), status('Result', 'status', ['OK']), issues()];
    case 'inventory-reconciliation': return [text('Receiving', 'referenceNumber'), category(), text('Date', 'receivedOn'), partyText('Supplier', 'supplier'), text('SKU', 'sku'), text('Product', 'productName'), count('Quantity', 'quantity'), status('Result', 'status', ['OK']), issues()];
    case 'monthly-debts': return [party('Customer', 'customer'), nestedText('Phone', 'customer', 'phone'), money('Single Debts', 'singleDebtOutstanding'), money('Installment Plans', 'installmentPlanOutstanding'), money('Total Outstanding', 'totalOutstanding'), money('Due by Cutoff', 'amountDueByCutoff'), money('Overdue', 'overdueAmountAtCutoff'), { label: 'Active Obligations', kind: 'text', key: 'activeObligations' }, text('Last Payment', 'lastPaymentDate')];
    case 'monthly-activity': return [text('Date', 'date'), partyText('Customer', 'customer'), nestedText('Phone', 'customer', 'phone'), text('Type', 'type'), text('Description', 'description'), money('Amount', 'amount')];
    default: return [];
  }
}

export interface SummarySpec {
  label: string;
  key: string;
  money?: boolean;
}
const s = (label: string, key: string, isMoney = false): SummarySpec => ({ label, key, money: isMoney });

/** The headline figures per slice, as the PC's summary cards show them. */
export const REPORT_SUMMARIES: Record<string, SummarySpec[]> = {
  'customers-new': [s('New customers', 'count')],
  'customers-debts': [s('Customers with debt', 'customerCount'), s('Outstanding', 'totalOutstanding', true), s('Due', 'totalAmountDueByCutoff', true), s('Overdue', 'totalOverdueAtCutoff', true)],
  'customers-payments': [s('Payments', 'count'), s('Collected', 'totalAmount', true)],
  'customers-aging': [s('Total receivables', 'totalReceivables', true), s('Overdue', 'totalOverdue', true), s('Customers owing', 'customersOwing'), s('Over 30 days', 'over30', true), s('Over 60 days', 'over60', true), s('Over 90 days', 'over90', true)],
  'customers-not-paid': [s('Customers', 'count'), s('Opening', 'openingBalance', true), s('New debt', 'newDebt', true), s('Closing', 'closingBalance', true), s('Old balances', 'withOldBalance')],
  'customers-paid': [s('Customers', 'count'), s('Payments', 'paymentCount'), s('Collected', 'paidInPeriod', true), s('Closing', 'closingBalance', true)],
  'products-bought': [s('Received lines', 'activeLines'), s('Total units', 'totalUnits'), s('Distinct products', 'distinctProducts'), s('Received not sold', 'receivedNotSold'), s('Reversed lines', 'reversedLines')],
  'products-cost-changes': [s('Cost changes', 'count'), s('Increases', 'increases'), s('Decreases', 'decreases'), s('From purchases', 'fromPurchases')],
  'suppliers-debts': [s('Transactions', 'count'), s('New owed', 'increased', true), s('Paid or credited', 'decreased', true), s('Net change', 'netChange', true)],
  'suppliers-receiving': [s('Documents', 'count'), s('Posted', 'posted'), s('Voided', 'voided')],
  'suppliers-aging': [s('Total payables USD', 'totalPayables', true), s('Overdue USD', 'totalOverdue', true), s('Due soon', 'dueSoonCount'), s('Due soon USD', 'dueSoonAmount', true), s('Future USD', 'futureAmount', true), s('Unscheduled / No Due Date', 'noDueDate', true), s('Unapplied payments/credits USD', 'unappliedCredit', true), s('Net ledger USD', 'ledgerBalance', true)],
  'sales-orders': [s('Orders', 'orderCount'), s('Sales', 'totalAmount', true), s('Paid', 'paidAmount', true), s('Unpaid', 'unpaidAmount', true)],
  'sales-unpaid': [s('Unpaid orders', 'count'), s('Remaining', 'remainingAmount', true)],
  'inventory-movements': [s('Movements', 'count')],
  'inventory-reconciliation': [s('Lines checked', 'count'), s('OK', 'ok'), s('Mismatches', 'mismatches')],
  'customers-financial-integrity': [s('Customers checked', 'count'), s('OK', 'ok'), s('Mismatches', 'mismatches'), s('Reported', 'reportedTotal', true), s('Independent', 'independentTotal', true), s('Difference', 'difference', true)],
  'sales-summary': [s('Orders', 'orderCount'), s('Gross sales', 'grossSales', true), s('Returns', 'returns', true), s('Net sales', 'netSales', true), s('Collected', 'collected', true), s('Left unpaid', 'leftUnpaid', true), s('Average order', 'averageOrder', true)],
  'sales-by-product': [s('Products sold', 'productCount'), s('Units sold', 'unitsSold'), s('Sales (ex VAT)', 'salesExVat', true), s('VAT', 'vat', true), s('Returns', 'returns', true), s('Net sales', 'netSales', true)],
  profit: [s('Net sales (ex VAT)', 'netSales', true), s('Cost of goods', 'costOfGoods', true), s('Gross profit', 'grossProfit', true), s('Margin %', 'marginPercent'), s('Products without a cost', 'productsWithoutCost')],
  'sales-by-customer': [s('Customers', 'customerCount'), s('Orders', 'orderCount'), s('Sales', 'sales', true), s('Paid', 'paid', true), s('Still owed', 'stillOwed', true)],
  'cash-flow': [s('Money in', 'moneyIn', true), s('Money out', 'moneyOut', true), s('Net cash flow', 'netCashFlow', true), s('Paid to suppliers', 'supplierPayments', true), s('Refunded to customers', 'customerRefunds', true)],
  'inventory-valuation': [s('Products in stock', 'productCount'), s('Units on hand', 'unitsOnHand'), s('Stock value (cost)', 'stockValue', true), s('Retail value', 'retailValue', true), s('Potential profit', 'potentialProfit', true), s('Products without a cost', 'productsWithoutCost')],
  'inventory-low-stock': [s('Products to reorder', 'count'), s('Out of stock', 'outOfStock'), s('Suggested units', 'suggestedUnits'), s('Estimated cost', 'estimatedCost', true)],
  'suppliers-paid': [s('Suppliers paid', 'count'), s('Payments', 'paymentCount'), s('Paid', 'paid', true), s('New bills', 'billed', true), s('Still owed', 'closingBalance', true)],
  'suppliers-not-paid': [s('Suppliers not paid', 'count'), s('Owed at start', 'openingBalance', true), s('New bills', 'billed', true), s('Still owed', 'closingBalance', true)],
  'suppliers-financial-integrity': [s('Suppliers checked', 'count'), s('OK', 'ok'), s('Mismatches', 'mismatches'), s('Reported', 'reportedTotal', true), s('Independent', 'independentTotal', true), s('Difference', 'difference', true)],
  'monthly-debts': [s('Customers', 'customerCount'), s('Total outstanding', 'totalOutstanding', true), s('Due by cutoff', 'totalAmountDueByCutoff', true), s('Overdue', 'totalOverdueAtCutoff', true), s('Paid this month', 'totalPaymentsReceivedDuringMonth', true)],
  'monthly-activity': [s('Customers affected', 'customerCountAffected'), s('Net change', 'netFinancialChange', true)],
};

export const AGING_BUCKET_LABELS: Record<string, string> = {
  DAYS_0_7: '0–7 days', DAYS_8_14: '8–14 days', DAYS_15_30: '15–30 days',
  DAYS_31_60: '31–60 days', DAYS_61_90: '61–90 days', DAYS_90_PLUS: '90+ days',
};
const AGING_TONE: Record<string, CellTone> = {
  DAYS_0_7: 'info', DAYS_8_14: 'info', DAYS_15_30: 'warn', DAYS_31_60: 'warn', DAYS_61_90: 'bad', DAYS_90_PLUS: 'bad',
};
const AGE_BAND: Record<string, string> = {
  CURRENT: 'Current / Not Due', DAYS_1_30: '1–30', DAYS_31_60: '31–60', DAYS_61_90: '61–90', DAYS_90_PLUS: '90+', NO_DUE_DATE: 'Unscheduled / No Due Date',
};
const SUPPLIER_DUE: Record<string, string> = { OVERDUE: 'Overdue', DUE_SOON: 'Due soon', FUTURE: 'Future', UNSCHEDULED: 'Unscheduled' };
export const RISK_LABELS: Record<string, string> = {
  NO_PAYMENT_THIS_PERIOD: 'No payment this month',
  OLD_UNPAID_BALANCE: 'Old unpaid balance',
  DEBT_INCREASED: 'Debt increased',
  HIGH_BALANCE: 'High balance',
};

const DASH = '—';
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

/** "PARTIALLY_PAID" -> "Partially paid"; dates formatted; booleans as Active/Archived. */
export function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return DASH;
  if (typeof value === 'boolean') return value ? 'Active' : 'Archived';
  const raw = String(value);
  if (ISO_DATE.test(raw)) return formatBusinessDate(raw);
  if (ISO_TIME.test(raw)) return formatDateTime(raw);
  if (/^[A-Z0-9_]+$/.test(raw) && raw.includes('_')) {
    const words = raw.toLowerCase().replace(/_/g, ' ');
    return words.charAt(0).toUpperCase() + words.slice(1);
  }
  if (/^[A-Z]{3,}$/.test(raw) && raw !== 'USD' && raw !== 'LBP' && raw !== 'VAT')
    return raw.charAt(0) + raw.slice(1).toLowerCase();
  return raw;
}

function asRecord(value: unknown): Row | null {
  return value && typeof value === 'object' ? (value as Row) : null;
}
function moneyText(value: unknown, currency: 'USD' | 'LBP' = 'USD') {
  return formatMoney(String(value ?? '0.00'), currency);
}

/** One table cell as display text plus an optional tone (never colour alone: the text says it too). */
export function cellFor(column: ReportColumnSpec, row: Row): Cell {
  switch (column.kind) {
    case 'text':
      if (column.key === 'activeObligations')
        return { text: `${Number(row.activeDebtCount ?? 0)} debts · ${Number(row.activePlanCount ?? 0)} plans` };
      return { text: displayValue(row[column.key]) };
    case 'money': {
      const value = row[column.key];
      if (column.nullable && value == null) return { text: DASH };
      const currency = column.currencyKey && row[column.currencyKey] === 'LBP' ? 'LBP' : 'USD';
      return { text: moneyText(value, currency) };
    }
    case 'count':
      return { text: displayValue(row[column.key]) };
    case 'signed': {
      const value = Number(row[column.key]);
      return { text: `${value > 0 ? '+' : ''}${value}`, tone: value < 0 ? 'bad' : 'info' };
    }
    case 'signedMoney': {
      const value = String(row[column.key] ?? '0.00');
      return { text: moneyText(value), tone: value.startsWith('-') ? 'bad' : 'good' };
    }
    case 'percent': {
      const value = row[column.key];
      if (value == null) return { text: DASH };
      const numeric = Number(value);
      if (!column.signedTone) return { text: `${String(value)}%` };
      return { text: `${numeric > 0 ? '+' : ''}${String(value)}%`, tone: numeric < 0 ? 'bad' : 'info' };
    }
    case 'margin': {
      const value = row[column.key];
      if (value == null) return { text: DASH };
      return { text: `${String(value)}%`, tone: Number(value) < 0 ? 'bad' : 'good' };
    }
    case 'nested': {
      const value = asRecord(row[column.parent])?.[column.key];
      if (column.money) return { text: value === undefined || value === null ? DASH : moneyText(value) };
      return { text: displayValue(value) };
    }
    case 'party': {
      const partyRow = asRecord(row[column.key]);
      if (!partyRow?.name) return { text: column.walkIn ? 'Walk-in' : DASH };
      return { text: String(partyRow.name) };
    }
    case 'product': {
      const item = asRecord(row.product);
      if (!item) return { text: DASH };
      return { text: `${String(item.name ?? DASH)}${item.model ? ` · ${String(item.model)}` : ''}` };
    }
    case 'category':
      return { text: String(row.categoryPath ?? 'Uncategorized') };
    case 'status': {
      const value = String(row[column.key] ?? '');
      // As on the PC: good unless listed bad, or good only when listed good.
      const isGood = column.bad ? !column.bad.includes(value) : (column.good ?? []).includes(value);
      return { text: displayValue(value), tone: isGood ? 'good' : 'warn' };
    }
    case 'changed':
      return row[column.key] === true ? { text: 'Changed', tone: 'warn' } : { text: 'Unchanged', tone: 'info' };
    case 'aging': {
      const bucket = String(row[column.key] ?? '');
      return { text: AGING_BUCKET_LABELS[bucket] ?? displayValue(bucket), tone: AGING_TONE[bucket] };
    }
    case 'ageBand': {
      const key = String(row[column.key] ?? '');
      return { text: AGE_BAND[key] ?? displayValue(key) };
    }
    case 'supplierDue': {
      const key = String(row[column.key] ?? '');
      return { text: SUPPLIER_DUE[key] ?? displayValue(key), tone: key === 'OVERDUE' ? 'bad' : key === 'DUE_SOON' ? 'warn' : undefined };
    }
    case 'risk': {
      const labels = (row[column.key] as string[] | undefined) ?? [];
      return labels.length ? { text: labels.map((label) => RISK_LABELS[label] ?? displayValue(label)).join(', '), tone: 'warn' } : { text: DASH };
    }
    case 'issues': {
      const list = (row[column.key] as string[] | undefined) ?? [];
      return list.length ? { text: list.join('; '), tone: 'bad' } : { text: DASH };
    }
  }
}

export interface SummaryFigure {
  label: string;
  text: string;
  money: boolean;
}
/** Headline figures for a slice, formatted. Missing keys are left out, not shown as zero. */
export function summaryFor(slice: string, summary: Row | undefined | null): SummaryFigure[] {
  if (!summary) return [];
  return (REPORT_SUMMARIES[slice] ?? [])
    .filter((spec) => summary[spec.key] !== undefined && summary[spec.key] !== null)
    .map((spec) => ({
      label: spec.label,
      money: Boolean(spec.money),
      text: spec.money ? moneyText(summary[spec.key]) : displayValue(summary[spec.key]),
    }));
}

/** Width for a column on a phone: wide for names, narrow for counts. */
export function columnWidth(column: ReportColumnSpec): number {
  if (column.width) return column.width;
  if (column.kind === 'count' || column.kind === 'signed') return 88;
  if (column.numeric) return 116;
  return 128;
}

/** Stable row key, like the PC's rowKey. */
export function reportRowKey(row: Row, index: number): string {
  const partyRow = asRecord(row.customer) ?? asRecord(row.supplier);
  return String(row.id ?? row.receivingId ?? partyRow?.id ?? index) + `:${index}`;
}
