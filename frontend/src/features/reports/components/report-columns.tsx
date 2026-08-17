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

export function columnsFor(slice: ReportSlice): ReportColumn[] {
  if (slice === 'customers-new') return [
    text('Date / التاريخ', 'createdOn'), text('Customer / الزبون', 'name'),
    text('Phone / الهاتف', 'phone'), text('Status / الحالة', 'isActive'),
  ];
  if (slice === 'customers-debts') return [
    partyLink('Customer / الزبون', 'customer', '/customers/'),
    money('Outstanding / الرصيد', 'totalOutstanding'), money('Due / المستحق', 'amountDueByCutoff'),
    money('Overdue / المتأخر', 'overdueAmountAtCutoff'), text('Last payment / آخر دفعة', 'lastPaymentDate'),
  ];
  if (slice === 'customers-payments') return [
    text('Date / التاريخ', 'paymentDate'), partyLink('Customer / الزبون', 'customer', '/customers/'),
    money('Amount / المبلغ', 'amount'), text('Method / الطريقة', 'paymentMethod'),
    text('Reference / المرجع', 'reference'),
  ];
  if (slice === 'customers-aging') return [
    partyLink('Customer / الزبون', 'customer', '/customers/'), nestedText('Phone / الهاتف', 'customer', 'phone'),
    text('Reference / المرجع', 'reference'), text('Created / تاريخ الدين', 'createdOn'),
    money('Original / الأصلي', 'originalAmount'), money('Paid / المدفوع', 'paidAmount'),
    money('Remaining / الباقي', 'remainingAmount'), count('Days unpaid / أيام', 'daysUnpaid'),
    agingBucketColumn(), text('Last payment / آخر دفعة', 'lastPaymentDate'),
    statusBadge('Status / الحالة', 'status', (value) => value === 'PARTIALLY_PAID'),
  ];
  if (slice === 'customers-not-paid' || slice === 'customers-paid') return [
    partyLink('Customer / الزبون', 'customer', '/customers/'), nestedText('Phone / الهاتف', 'customer', 'phone'),
    money('Opening / الافتتاحي', 'openingBalance'), money('New debt / دين جديد', 'newDebt'),
    money('Paid / المدفوع', 'paidInPeriod'), money('Closing / الختامي', 'closingBalance'),
    count('Payments / الدفعات', 'paymentCount'), count('Unpaid items / بنود غير مدفوعة', 'unpaidDebtCount'),
    text('Last payment / آخر دفعة', 'lastPaymentDate'), count('Days since / منذ', 'daysSinceLastPayment'),
    riskLabelsColumn(),
  ];
  if (slice === 'products-bought') return [
    text('Date / التاريخ', 'receivedOn'), nestedText('Product / المنتج', 'product', 'name'),
    text('SKU', 'sku'), partyLink('Supplier / المورد', 'supplier', '/suppliers/'),
    linked('Reference / المرجع', 'referenceNumber', '/inventory/receiving/', 'receivingId'),
    count('Received / المستلم', 'quantity'), count('Current stock / المخزون', 'currentStock'),
    count('Sold in period / المباع', 'soldInPeriod'),
    statusBadge('Line / البند', 'status', (value) => value === 'ACTIVE'),
    nestedMoney('Linked bill / الفاتورة', 'linkedDebt', 'amount'),
  ];
  if (slice === 'suppliers-debts') return [
    text('Date / التاريخ', 'transactionDate'), partyLink('Supplier / المورد', 'supplier', '/suppliers/'),
    text('Type / النوع', 'type'), text('Direction / الاتجاه', 'direction'),
    money('Amount / المبلغ', 'amount'), text('Description / الوصف', 'description'),
    text('Receipt / الفاتورة', 'receiptNumber'),
  ];
  if (slice === 'suppliers-receiving') return [
    text('Date / التاريخ', 'receivedOn'), partyLink('Supplier / المورد', 'supplier', '/suppliers/'),
    linked('Reference / المرجع', 'referenceNumber', '/inventory/receiving/', 'id'),
    statusBadge('Status / الحالة', 'status', (value) => value === 'POSTED'),
    count('Lines / البنود', 'lineCount'), count('Quantity / الكمية', 'totalQuantity'),
    nestedMoney('Linked debt / الدين المرتبط', 'linkedDebt', 'amount'),
  ];
  if (slice === 'sales-orders' || slice === 'sales-unpaid') return [
    linked('Order / الطلب', 'orderNumber', '/sales-orders/', 'id'), text('Date / التاريخ', 'orderDate'),
    partyText('Customer / الزبون', 'customer'),
    statusBadge('Payment / الدفع', 'paymentStatus', (value) => value === 'PAID'),
    text('Fulfillment / التنفيذ', 'fulfillmentStatus'), money('Total / الإجمالي', 'totalAmount'),
    money('Paid / المدفوع', 'paidAmount'), money('Remaining / الباقي', 'remainingAmount'),
  ];
  if (slice === 'inventory-movements') return [
    text('Timestamp / الوقت', 'createdAt'), partyText('Product / المنتج', 'product'),
    nestedText('SKU', 'product', 'sku'), text('Type / النوع', 'movementType'),
    signed('Change / التغيير', 'quantityChange'), count('Before / قبل', 'quantityBefore'),
    count('After / بعد', 'quantityAfter'), text('Reason / السبب', 'reason'),
  ];
  return [
    linked('Receiving / الاستلام', 'referenceNumber', '/inventory/receiving/', 'receivingId'),
    text('Date / التاريخ', 'receivedOn'), partyText('Supplier / المورد', 'supplier'),
    text('SKU', 'sku'), text('Product / المنتج', 'productName'), count('Quantity / الكمية', 'quantity'),
    statusBadge('Result / النتيجة', 'status', (value) => value === 'OK'), issuesColumn(),
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
    'customers-new': [['New customers / زبائن جدد', 'count']],
    'customers-debts': [['Customers with debt / زبائن مدينون', 'customerCount'], ['Outstanding / الرصيد', 'totalOutstanding', true], ['Due / المستحق', 'totalAmountDueByCutoff', true], ['Overdue / المتأخر', 'totalOverdueAtCutoff', true]],
    'customers-payments': [['Payments / الدفعات', 'count'], ['Collected / المحصل', 'totalAmount', true]],
    'customers-aging': [['Total receivables / إجمالي الذمم', 'totalReceivables', true], ['Overdue / المتأخر', 'totalOverdue', true], ['Customers owing / زبائن مدينون', 'customersOwing'], ['Over 30 days / أكثر من ٣٠ يوم', 'over30', true], ['Over 60 days / أكثر من ٦٠ يوم', 'over60', true], ['Over 90 days / أكثر من ٩٠ يوم', 'over90', true]],
    'customers-not-paid': [['Customers / الزبائن', 'count'], ['Opening / الافتتاحي', 'openingBalance', true], ['New debt / دين جديد', 'newDebt', true], ['Closing / الختامي', 'closingBalance', true], ['Old balances / أرصدة قديمة', 'withOldBalance']],
    'customers-paid': [['Customers / الزبائن', 'count'], ['Payments / الدفعات', 'paymentCount'], ['Collected / المحصل', 'paidInPeriod', true], ['Closing / الختامي', 'closingBalance', true]],
    'products-bought': [['Received lines / بنود مستلمة', 'activeLines'], ['Total units / إجمالي الوحدات', 'totalUnits'], ['Distinct products / منتجات', 'distinctProducts'], ['Received not sold / لم تُبع', 'receivedNotSold'], ['Reversed lines / بنود معكوسة', 'reversedLines']],
    'suppliers-debts': [['Transactions / الحركات', 'count'], ['New owed / دين جديد', 'increased', true], ['Paid or credited / مدفوع أو دائن', 'decreased', true], ['Net change / صافي التغيير', 'netChange', true]],
    'suppliers-receiving': [['Documents / المستندات', 'count'], ['Posted / مثبت', 'posted'], ['Voided / ملغى', 'voided']],
    'sales-orders': [['Orders / الطلبات', 'orderCount'], ['Sales / المبيعات', 'totalAmount', true], ['Paid / المدفوع', 'paidAmount', true], ['Unpaid / غير المدفوع', 'unpaidAmount', true]],
    'sales-unpaid': [['Unpaid orders / طلبات غير مدفوعة', 'count'], ['Remaining / الباقي', 'remainingAmount', true]],
    'inventory-movements': [['Movements / الحركات', 'count']],
    'inventory-reconciliation': [['Lines checked / بنود مفحوصة', 'count'], ['OK / سليم', 'ok'], ['Mismatches / غير مطابق', 'mismatches']],
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
  return String(value.id ?? value.receivingId ?? `${index}`);
}

export const AGING_BUCKET_LABELS: Record<string, string> = {
  DAYS_0_7: '0–7 days / ٠–٧', DAYS_8_14: '8–14 days / ٨–١٤', DAYS_15_30: '15–30 days / ١٥–٣٠',
  DAYS_31_60: '31–60 days / ٣١–٦٠', DAYS_61_90: '61–90 days / ٦١–٩٠', DAYS_90_PLUS: '90+ days / ٩٠+',
};

/** Older money reads hotter, so the band carries its own colour and its own text. */
function agingBucketColumn(): ReportColumn {
  const tone: Record<string, string> = {
    DAYS_0_7: 'bg-emerald-50 text-emerald-700', DAYS_8_14: 'bg-emerald-50 text-emerald-700',
    DAYS_15_30: 'bg-amber-50 text-amber-800', DAYS_31_60: 'bg-amber-50 text-amber-800',
    DAYS_61_90: 'bg-orange-50 text-orange-800', DAYS_90_PLUS: 'bg-red-50 text-red-700',
  };
  return {
    label: 'Age / العمر',
    render: (row) => {
      const bucket = String(record(row).bucket ?? '');
      return <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${tone[bucket] ?? 'bg-slate-100 text-slate-700'}`}>{AGING_BUCKET_LABELS[bucket] ?? display(bucket)}</span>;
    },
  };
}

export const RISK_LABELS: Record<string, string> = {
  NO_PAYMENT_THIS_PERIOD: 'No payment this month / لم يدفع هذا الشهر',
  OLD_UNPAID_BALANCE: 'Old unpaid balance / دين قديم غير مدفوع',
  DEBT_INCREASED: 'Debt increased / الدين ازداد',
  HIGH_BALANCE: 'High balance / رصيد مرتفع',
};

function riskLabelsColumn(): ReportColumn {
  return {
    label: 'Risk / الخطر',
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

function count(label: string, key: string): ReportColumn {
  return { label, numeric: true, render: (row) => <span className="tabular-nums">{display(record(row)[key])}</span> };
}

function signed(label: string, key: string): ReportColumn {
  return {
    label,
    numeric: true,
    render: (row) => {
      const value = Number(record(row)[key]);
      return <strong className={`tabular-nums ${value < 0 ? 'text-red-700' : 'text-emerald-700'}`}>{value > 0 ? '+' : ''}{value}</strong>;
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
        ? <Link to={`${base}${party.id}`} className="user-text font-semibold text-emerald-700 hover:underline" dir="auto">{display(party.name)}</Link>
        : '—';
    },
  };
}

function linked(label: string, textKey: string, base: string, idKey: string): ReportColumn {
  return {
    label,
    render: (row) => <Link to={`${base}${record(row)[idKey]}`} className="font-semibold text-emerald-700 hover:underline">{display(record(row)[textKey])}</Link>,
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

function issuesColumn(): ReportColumn {
  return {
    label: 'Issues / المشاكل',
    render: (row) => {
      const issues = record(row).issues as string[];
      return issues.length ? <ul className="list-disc pl-4 text-red-700">{issues.map((issue) => <li key={issue}>{issue}</li>)}</ul> : '—';
    },
  };
}
