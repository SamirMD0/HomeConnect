import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { formatMoney } from '../../customer-financial/utils/financial-format';
import type { ReportRow, ReportSlice } from '../types/report-rows.types';

/**
 * Column and summary definitions for every row-level report slice.
 *
 * Lifted out of the old tabbed DomainReports component so the report detail
 * page owns rendering and this file owns only the shape of each report. Money
 * is formatted here for display; it is never summed, averaged, or derived —
 * every figure below is a backend-computed string rendered as-is.
 */
export interface ReportColumn {
  label: string;
  render: (row: ReportRow) => ReactNode;
  /** Right-aligned, tabular figures. */
  numeric?: boolean;
}

function categoryColumn(): ReportColumn {
  return { label: 'Category (current catalogue)', render: (row) => String(record(row).categoryPath ?? 'Uncategorized') };
}

function productColumns(): ReportColumn[] {
  return [
    { label: 'Product', render: (row) => {
      const product = record(row).product as { id: string | null; name: string; sku: string | null; model?: string | null };
      const label = <span className="user-text" dir="auto">{product.name}{product.model ? ` · ${product.model}` : ''}</span>;
      return product.id ? <Link to={`/products?focus=${product.id}`} className="font-semibold text-brand-700 hover:underline">{label}</Link> : label;
    } },
    nestedText('SKU', 'product', 'sku'),
  ];
}

function marginColumn(): ReportColumn {
  return { label: 'Margin', numeric: true, render: (row) => {
    const value = record(row).marginPercent;
    return value == null ? '—' : <strong className={`tabular-nums ${Number(value) < 0 ? 'text-red-700' : 'text-emerald-700'}`}>{String(value)}%</strong>;
  } };
}

function signedMoney(label: string, key: string): ReportColumn {
  return { label, numeric: true, render: (row) => {
    const value = String(record(row)[key] ?? '0.00');
    return <strong className={`tabular-nums ${value.startsWith('-') ? 'text-red-700' : 'text-emerald-700'}`}>{formatMoney(value)}</strong>;
  } };
}

const supplierMovementColumns = (): ReportColumn[] => [
  partyLink('Supplier', 'supplier', '/suppliers/'), nestedText('Phone', 'supplier', 'phone'),
  money('Owed at start', 'openingBalance'), money('New bills', 'billed'), money('Paid', 'paid'),
  money('Credits', 'credits'), money('Owed now', 'closingBalance'), count('Payments', 'paymentCount'),
  text('Last payment', 'lastPaymentDate'),
];

export function columnsFor(slice: ReportSlice): ReportColumn[] {
  if (slice === 'sales-summary') return [
    text('Date', 'date'), count('Orders', 'orderCount'), money('Gross sales', 'grossSales'), money('Returns', 'returns'),
    money('Net sales', 'netSales'), money('Collected', 'collected'), money('Left unpaid', 'leftUnpaid'),
  ];
  if (slice === 'sales-by-product') return [
    ...productColumns(), count('Units sold', 'unitsSold'), count('Returned', 'unitsReturned'),
    money('Sales (ex VAT)', 'salesExVat'), money('VAT', 'vat'), money('Returns', 'returns'),
    money('Net sales', 'netSales'), nullableMoney('Avg price', 'averagePrice'),
  ];
  if (slice === 'profit') return [
    ...productColumns(), count('Net units', 'netUnits'), money('Net sales (ex VAT)', 'netSales'),
    nullableMoney('Unit cost', 'unitCost'), nullableMoney('Cost of goods', 'costOfGoods'),
    nullableMoney('Gross profit', 'grossProfit'), marginColumn(),
  ];
  if (slice === 'sales-by-customer') return [
    partyLink('Customer', 'customer', '/customers/'), nestedText('Phone', 'customer', 'phone'),
    count('Orders', 'orderCount'), money('Sales', 'sales'), money('Paid', 'paid'), money('Still owed', 'stillOwed'),
    { label: 'Share of sales', numeric: true, render: (row) => { const v = record(row).shareOfSales; return v == null ? '—' : `${String(v)}%`; } },
    text('Last order', 'lastOrderDate'),
  ];
  if (slice === 'cash-flow') return [
    text('Date', 'date'), money('From customers', 'customerPayments'), money('To suppliers', 'supplierPayments'),
    money('Refunds', 'customerRefunds'), money('Money in', 'moneyIn'), money('Money out', 'moneyOut'),
    signedMoney('Net cash flow', 'netCashFlow'), signedMoney('Running total', 'cumulativeNet'),
  ];
  if (slice === 'inventory-valuation') return [
    ...productColumns(), count('On hand', 'onHand'), nullableMoney('Unit cost', 'unitCost'),
    nullableMoney('Stock value (cost)', 'stockValue'), nullableMoney('Unit price', 'unitPrice'), nullableMoney('Retail value', 'retailValue'),
  ];
  if (slice === 'inventory-low-stock') return [
    ...productColumns(), count('On hand', 'onHand'), count('Reorder level', 'reorderLevel'),
    count('Sold in period', 'soldInPeriod'), count('Suggested order', 'suggestedOrder'),
    nullableMoney('Estimated cost', 'estimatedCost'),
    statusBadge('Status', 'status', (value) => value !== 'OUT_OF_STOCK'),
  ];
  if (slice === 'suppliers-paid' || slice === 'suppliers-not-paid') return supplierMovementColumns();
  if (slice === 'customers-new') return [
    text('Date', 'createdOn'), text('Customer', 'name'),
    text('Phone', 'phone'), text('Status', 'isActive'),
  ];
  if (slice === 'customers-debts') return [
    partyLink('Customer', 'customer', '/customers/'),
    money('Outstanding', 'totalOutstanding'), money('Due', 'amountDueByCutoff'),
    money('Overdue', 'overdueAmountAtCutoff'), text('Last payment', 'lastPaymentDate'),
  ];
  if (slice === 'customers-payments') return [
    text('Date', 'paymentDate'), partyLink('Customer', 'customer', '/customers/'),
    { label: 'Amount', numeric: true, render: (row) => formatMoney(String(record(row).amount), record(row).currency === 'LBP' ? 'LBP' : 'USD') }, text('Currency', 'currency'), text('Method', 'paymentMethod'),
    text('Reference', 'reference'),
  ];
  if (slice === 'customers-aging') return [
    partyLink('Customer', 'customer', '/customers/'), nestedText('Phone', 'customer', 'phone'),
    text('Reference', 'reference'), text('Created', 'createdOn'),
    money('Original', 'originalAmount'), money('Paid', 'paidAmount'),
    money('Remaining', 'remainingAmount'), count('Days unpaid', 'daysUnpaid'),
    agingBucketColumn(), text('Last payment', 'lastPaymentDate'),
    statusBadge('Status', 'status', (value) => value === 'PARTIALLY_PAID'),
  ];
  if (slice === 'customers-not-paid' || slice === 'customers-paid') return [
    partyLink('Customer', 'customer', '/customers/'), nestedText('Phone', 'customer', 'phone'),
    money('Opening', 'openingBalance'), money('New debt', 'newDebt'),
    money('Return credits', 'returnCredits'),
    money('Paid', 'paidInPeriod'), money('Closing', 'closingBalance'),
    count('Payments', 'paymentCount'), count('Unpaid items', 'unpaidDebtCount'),
    text('Last payment', 'lastPaymentDate'), count('Days since', 'daysSinceLastPayment'),
    riskLabelsColumn(),
  ];
  if (slice === 'products-bought') return [
    categoryColumn(),
    text('Date', 'receivedOn'), nestedText('Product', 'product', 'name'),
    text('SKU', 'sku'), partyLink('Supplier', 'supplier', '/suppliers/'),
    linked('Reference', 'referenceNumber', '/inventory/receiving/', 'receivingId'),
    count('Received', 'quantity'), count('Current stock', 'currentStock'),
    count('Sold in period', 'soldInPeriod'),
    statusBadge('Line', 'status', (value) => value === 'ACTIVE'),
    nestedMoney('Linked bill', 'linkedDebt', 'amount'),
  ];
  if (slice === 'products-cost-changes') return [
    categoryColumn(),
    text('Changed', 'changedAt'),
    partyText('Product', 'product'),
    nestedText('SKU', 'product', 'sku'),
    nullableMoney('Old cost', 'oldCost'),
    nullableMoney('New cost', 'newCost'),
    nullableMoney('Old selling', 'oldSellingPrice'),
    nullableMoney('New selling', 'newSellingPrice'),
    text('Pricing mode', 'sellingPriceSource'),
    booleanStatusBadge('Selling changed', 'sellingPriceChanged'),
    percentage('Change', 'percentageChange'),
    text('Source', 'source'),
    text('Receipt', 'receiptNumber'),
    nestedText('Changed by', 'changedBy', 'fullName'),
    text('Reason', 'reason'),
  ];
  if (slice === 'suppliers-debts') return [
    text('Date', 'transactionDate'), partyLink('Supplier', 'supplier', '/suppliers/'),
    text('Type', 'type'), text('Direction', 'direction'),
    money('Amount', 'amount'), text('Description', 'description'),
    text('Receipt', 'receiptNumber'),
  ];
  if (slice === 'suppliers-aging') return [
    partyLink('Supplier', 'supplier', '/suppliers/'), text('Receipt', 'receiptNumber'),
    text('Due date', 'dueDate'), text('Currency', 'currency'),
    text('Original transaction', 'transactionAmount'), money('Original USD', 'originalAmount'),
    money('FIFO settled USD', 'fifoSettledAmount'), money('Remaining USD', 'remainingAmount'),
    count('Days overdue', 'daysOverdue'),
    { label: 'Age band', render: (r) => {
      const labels: Record<string, string> = { CURRENT: 'Current / Not Due', DAYS_1_30: '1–30', DAYS_31_60: '31–60', DAYS_61_90: '61–90', DAYS_90_PLUS: '90+', NO_DUE_DATE: 'Unscheduled / No Due Date' };
      const key = String((r as unknown as Record<string, unknown>).bucket);
      return labels[key] ?? key;
    } },
    { label: 'Status', render: (r) => {
      const labels: Record<string, string> = { OVERDUE: 'Overdue', DUE_SOON: 'Due soon', FUTURE: 'Future', UNSCHEDULED: 'Unscheduled' };
      const key = String((r as unknown as Record<string, unknown>).status);
      return labels[key] ?? key;
    } },
  ];
  if (slice === 'suppliers-receiving') return [
    text('Date', 'receivedOn'), partyLink('Supplier', 'supplier', '/suppliers/'),
    linked('Reference', 'referenceNumber', '/inventory/receiving/', 'id'),
    statusBadge('Status', 'status', (value) => value === 'POSTED'),
    count('Lines', 'lineCount'), count('Quantity', 'totalQuantity'),
    nestedMoney('Linked debt', 'linkedDebt', 'amount'),
  ];
  if (slice === 'sales-orders' || slice === 'sales-unpaid') return [
    linked('Order', 'orderNumber', '/sales-orders/', 'id'), text('Date', 'orderDate'),
    partyText('Customer', 'customer'),
    statusBadge('Payment', 'paymentStatus', (value) => value === 'PAID'),
    text('Fulfillment', 'fulfillmentStatus'), money('Total', 'totalAmount'),
    money('Paid', 'paidAmount'), money('Remaining', 'remainingAmount'),
  ];
  if (slice === 'inventory-movements') return [
    categoryColumn(),
    text('Timestamp', 'createdAt'), partyText('Product', 'product'),
    nestedText('SKU', 'product', 'sku'), text('Type', 'movementType'),
    signed('Change', 'quantityChange'), count('Before', 'quantityBefore'),
    count('After', 'quantityAfter'), text('Reason', 'reason'),
  ];
  if (slice === 'customers-financial-integrity') return [
    partyLink('Customer', 'customer', '/customers/'),
    nestedText('Phone', 'customer', 'phone'),
    money('Obligations', 'obligationTotal'),
    money('Allocations', 'allocationTotal'),
    money('Reported', 'reportedOutstanding'),
    money('Independent', 'independentOutstanding'),
    money('Difference', 'difference'),
    statusBadge('Result', 'status', (value) => value === 'OK'),
    issuesColumn(),
  ];
  if (slice === 'suppliers-financial-integrity') return [
    partyLink('Supplier', 'supplier', '/suppliers/'),
    nestedText('Phone', 'supplier', 'phone'),
    money('Increases', 'increaseTotal'),
    money('Decreases', 'decreaseTotal'),
    money('Reported', 'reportedBalance'),
    money('Independent', 'independentBalance'),
    money('Difference', 'difference'),
    statusBadge('Result', 'status', (value) => value === 'OK'),
    issuesColumn(),
  ];
  return [
    linked('Receiving', 'referenceNumber', '/inventory/receiving/', 'receivingId'),
    categoryColumn(),
    text('Date', 'receivedOn'), partyText('Supplier', 'supplier'),
    text('SKU', 'sku'), text('Product', 'productName'), count('Quantity', 'quantity'),
    statusBadge('Result', 'status', (value) => value === 'OK'), issuesColumn(),
  ];
}

export interface ReportSummaryItem {
  label: string;
  value: string;
  money: boolean;
}

export function summariesFor(
  slice: ReportSlice,
  summary: Record<string, string | number | boolean | Record<string, unknown>>
): ReportSummaryItem[] {
  const definitions: Partial<Record<ReportSlice, Array<[string, string, boolean?]>>> = {
    'customers-new': [['New customers', 'count']],
    'customers-debts': [['Customers with debt', 'customerCount'], ['Outstanding', 'totalOutstanding', true], ['Due', 'totalAmountDueByCutoff', true], ['Overdue', 'totalOverdueAtCutoff', true]],
    'customers-payments': [['Payments', 'count'], ['Collected', 'totalAmount', true]],
    'customers-aging': [['Total receivables', 'totalReceivables', true], ['Overdue', 'totalOverdue', true], ['Customers owing', 'customersOwing'], ['Over 30 days', 'over30', true], ['Over 60 days', 'over60', true], ['Over 90 days', 'over90', true]],
    'customers-not-paid': [['Customers', 'count'], ['Opening', 'openingBalance', true], ['New debt', 'newDebt', true], ['Closing', 'closingBalance', true], ['Old balances', 'withOldBalance']],
    'customers-paid': [['Customers', 'count'], ['Payments', 'paymentCount'], ['Collected', 'paidInPeriod', true], ['Closing', 'closingBalance', true]],
    'products-bought': [['Received lines', 'activeLines'], ['Total units', 'totalUnits'], ['Distinct products', 'distinctProducts'], ['Received not sold', 'receivedNotSold'], ['Reversed lines', 'reversedLines']],
    'products-cost-changes': [['Cost changes', 'count'], ['Increases', 'increases'], ['Decreases', 'decreases'], ['From purchases', 'fromPurchases']],
    'suppliers-debts': [['Transactions', 'count'], ['New owed', 'increased', true], ['Paid or credited', 'decreased', true], ['Net change', 'netChange', true]],
    'suppliers-receiving': [['Documents', 'count'], ['Posted', 'posted'], ['Voided', 'voided']],
    'suppliers-aging': [['Total payables USD', 'totalPayables', true], ['Overdue USD', 'totalOverdue', true], ['Due soon', 'dueSoonCount'], ['Due soon USD', 'dueSoonAmount', true], ['Future USD', 'futureAmount', true], ['Unscheduled / No Due Date', 'noDueDate', true], ['Unapplied payments/credits USD', 'unappliedCredit', true], ['Net ledger USD', 'ledgerBalance', true]],
    'sales-orders': [['Orders', 'orderCount'], ['Sales', 'totalAmount', true], ['Paid', 'paidAmount', true], ['Unpaid', 'unpaidAmount', true]],
    'sales-unpaid': [['Unpaid orders', 'count'], ['Remaining', 'remainingAmount', true]],
    'inventory-movements': [['Movements', 'count']],
    'inventory-reconciliation': [['Lines checked', 'count'], ['OK', 'ok'], ['Mismatches', 'mismatches']],
    'customers-financial-integrity': [['Customers checked', 'count'], ['OK', 'ok'], ['Mismatches', 'mismatches'], ['Reported', 'reportedTotal', true], ['Independent', 'independentTotal', true], ['Difference', 'difference', true]],
    'sales-summary': [['Orders', 'orderCount'], ['Gross sales', 'grossSales', true], ['Returns', 'returns', true], ['Net sales', 'netSales', true], ['Collected', 'collected', true], ['Left unpaid', 'leftUnpaid', true], ['Average order', 'averageOrder', true]],
    'sales-by-product': [['Products sold', 'productCount'], ['Units sold', 'unitsSold'], ['Sales (ex VAT)', 'salesExVat', true], ['VAT', 'vat', true], ['Returns', 'returns', true], ['Net sales', 'netSales', true]],
    profit: [['Net sales (ex VAT)', 'netSales', true], ['Cost of goods', 'costOfGoods', true], ['Gross profit', 'grossProfit', true], ['Margin %', 'marginPercent'], ['Products without a cost', 'productsWithoutCost']],
    'sales-by-customer': [['Customers', 'customerCount'], ['Orders', 'orderCount'], ['Sales', 'sales', true], ['Paid', 'paid', true], ['Still owed', 'stillOwed', true]],
    'cash-flow': [['Money in', 'moneyIn', true], ['Money out', 'moneyOut', true], ['Net cash flow', 'netCashFlow', true], ['Paid to suppliers', 'supplierPayments', true], ['Refunded to customers', 'customerRefunds', true]],
    'inventory-valuation': [['Products in stock', 'productCount'], ['Units on hand', 'unitsOnHand'], ['Stock value (cost)', 'stockValue', true], ['Retail value', 'retailValue', true], ['Potential profit', 'potentialProfit', true], ['Products without a cost', 'productsWithoutCost']],
    'inventory-low-stock': [['Products to reorder', 'count'], ['Out of stock', 'outOfStock'], ['Suggested units', 'suggestedUnits'], ['Estimated cost', 'estimatedCost', true]],
    'suppliers-paid': [['Suppliers paid', 'count'], ['Payments', 'paymentCount'], ['Paid', 'paid', true], ['New bills', 'billed', true], ['Still owed', 'closingBalance', true]],
    'suppliers-not-paid': [['Suppliers not paid', 'count'], ['Owed at start', 'openingBalance', true], ['New bills', 'billed', true], ['Still owed', 'closingBalance', true]],
    'suppliers-financial-integrity': [['Suppliers checked', 'count'], ['OK', 'ok'], ['Mismatches', 'mismatches'], ['Reported', 'reportedTotal', true], ['Independent', 'independentTotal', true], ['Difference', 'difference', true]],
  };
  return (definitions[slice] ?? []).map(([label, key, moneyValue]) => ({
    label, value: String(summary[key] ?? '0'), money: Boolean(moneyValue),
  }));
}

export function movementSummaryRows(value: unknown) {
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value as Record<string, { count: number; quantityChange: number }>)
    .filter(([, summary]) => summary.count > 0)
    .map(([type, summary]) => ({ type: type.replaceAll('_', ' '), count: summary.count, quantityChange: summary.quantityChange }));
}

export function rowKey(row: ReportRow, index: number) {
  const value = record(row);
  const party = (value.customer ?? value.supplier) as Record<string, unknown> | undefined;
  return String(value.id ?? value.receivingId ?? party?.id ?? `${index}`);
}

export const AGING_BUCKET_LABELS: Record<string, string> = {
  DAYS_0_7: '0–7 days', DAYS_8_14: '8–14 days', DAYS_15_30: '15–30 days',
  DAYS_31_60: '31–60 days', DAYS_61_90: '61–90 days', DAYS_90_PLUS: '90+ days',
};

/** Older money reads hotter, so the band carries its own colour and its own text. */
function agingBucketColumn(): ReportColumn {
  const tone: Record<string, string> = {
    DAYS_0_7: 'bg-brand-50 text-brand-700', DAYS_8_14: 'bg-brand-50 text-brand-700',
    DAYS_15_30: 'bg-amber-50 text-amber-800', DAYS_31_60: 'bg-amber-50 text-amber-800',
    DAYS_61_90: 'bg-orange-50 text-orange-800', DAYS_90_PLUS: 'bg-red-50 text-red-700',
  };
  return {
    label: 'Age',
    render: (row) => {
      const bucket = String(record(row).bucket ?? '');
      return <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${tone[bucket] ?? 'bg-slate-100 text-slate-700'}`}>{AGING_BUCKET_LABELS[bucket] ?? display(bucket)}</span>;
    },
  };
}

export const RISK_LABELS: Record<string, string> = {
  NO_PAYMENT_THIS_PERIOD: 'No payment this month',
  OLD_UNPAID_BALANCE: 'Old unpaid balance',
  DEBT_INCREASED: 'Debt increased',
  HIGH_BALANCE: 'High balance',
};

function riskLabelsColumn(): ReportColumn {
  return {
    label: 'Risk',
    render: (row) => {
      const labels = (record(row).riskLabels as string[] | undefined) ?? [];
      if (labels.length === 0) return '—';
      return <div className="flex flex-wrap gap-1">{labels.map((label) => (
        <span key={label} className="inline-block whitespace-nowrap rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">{RISK_LABELS[label] ?? display(label)}</span>
      ))}</div>;
    },
  };
}

function record(row: ReportRow) { return row as unknown as Record<string, unknown>; }

function display(value: unknown) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Active' : 'Archived';
  return String(value).replaceAll('_', ' ');
}

function text(label: string, key: string): ReportColumn {
  return { label, render: (row) => <span className="user-text" dir="auto">{display(record(row)[key])}</span> };
}

function money(label: string, key: string): ReportColumn {
  return { label, numeric: true, render: (row) => <strong className="tabular-nums">{formatMoney(String(record(row)[key] ?? '0.00'))}</strong> };
}

function nullableMoney(label: string, key: string): ReportColumn {
  return {
    label,
    numeric: true,
    render: (row) => {
      const value = record(row)[key];
      return value == null ? '—' : <strong className="tabular-nums">{formatMoney(String(value))}</strong>;
    },
  };
}

function percentage(label: string, key: string): ReportColumn {
  return {
    label,
    numeric: true,
    render: (row) => {
      const value = record(row)[key];
      if (value == null) return '—';
      const numeric = Number(value);
      return <strong className={`tabular-nums ${numeric < 0 ? 'text-red-700' : 'text-brand-700'}`}>{numeric > 0 ? '+' : ''}{String(value)}%</strong>;
    },
  };
}

function count(label: string, key: string): ReportColumn {
  return { label, numeric: true, render: (row) => <span className="tabular-nums">{display(record(row)[key])}</span> };
}

function signed(label: string, key: string): ReportColumn {
  return {
    label,
    numeric: true,
    render: (row) => {
      const value = Number(record(row)[key]);
      return <strong className={`tabular-nums ${value < 0 ? 'text-red-700' : 'text-brand-700'}`}>{value > 0 ? '+' : ''}{value}</strong>;
    },
  };
}

function nestedText(label: string, parent: string, key: string): ReportColumn {
  return { label, render: (row) => display((record(row)[parent] as Record<string, unknown> | null)?.[key]) };
}

function nestedMoney(label: string, parent: string, key: string): ReportColumn {
  return {
    label,
    numeric: true,
    render: (row) => {
      const value = (record(row)[parent] as Record<string, unknown> | null)?.[key];
      return value === undefined ? '—' : <strong className="tabular-nums">{formatMoney(String(value))}</strong>;
    },
  };
}

function partyText(label: string, key: string): ReportColumn {
  return {
    label,
    render: (row) => {
      const party = record(row)[key] as Record<string, unknown> | null;
      return <span className="user-text" dir="auto">{display(party?.name)}</span>;
    },
  };
}

function partyLink(label: string, key: string, base: string): ReportColumn {
  return {
    label,
    render: (row) => {
      const party = record(row)[key] as Record<string, unknown> | null;
      return party?.id
        ? <Link to={`${base}${party.id}`} className="user-text font-semibold text-brand-700 hover:underline" dir="auto">{display(party.name)}</Link>
        : key === 'customer' ? 'Walk-in' : '—';
    },
  };
}

function linked(label: string, textKey: string, base: string, idKey: string): ReportColumn {
  return {
    label,
    render: (row) => <Link to={`${base}${record(row)[idKey]}`} className="font-semibold text-brand-700 hover:underline">{display(record(row)[textKey])}</Link>,
  };
}

/** Status never rests on colour alone — the badge always carries its own text. */
function statusBadge(label: string, key: string, isGood: (value: string) => boolean): ReportColumn {
  return {
    label,
    render: (row) => {
      const value = String(record(row)[key] ?? '');
      return <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${isGood(value) ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>{display(value)}</span>;
    },
  };
}

function booleanStatusBadge(label: string, key: string): ReportColumn {
  return {
    label,
    render: (row) => {
      const changed = record(row)[key] === true;
      return <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${changed ? 'bg-amber-50 text-amber-800' : 'bg-brand-50 text-brand-700'}`}>
        {changed ? 'Changed' : 'Unchanged'}
      </span>;
    },
  };
}

function issuesColumn(): ReportColumn {
  return {
    label: 'Issues',
    render: (row) => {
      const issues = record(row).issues as string[];
      return issues.length ? <ul className="list-disc pl-4 text-red-700">{issues.map((issue) => <li key={issue}>{issue}</li>)}</ul> : '—';
    },
  };
}
