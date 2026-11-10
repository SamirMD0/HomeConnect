/**
 * Standard ERP / accounting reports: sales summary, sales by product and by
 * customer, cash flow, gross profit, stock valuation, low stock, and which
 * suppliers were or were not paid.
 *
 * Every amount is in base USD, from the base columns the ledger already
 * stores, so these reports agree with the rest of the reporting module.
 */
import {
  Currency, PaymentMethod, SalesOrderFulfillmentStatus, SalesReturnRefundMethod,
  SupplierTransactionDirection, SupplierTransactionStatus, SupplierTransactionType,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { prisma } from '../../../lib/prisma';
import { scopeWhere, type BranchScope } from '../../branches/branch-scope';
import {
  businessDateToPrisma, moneyToApiString, prismaDateToBusinessDate, subtractMoney, sumMoney, toBaseAmount, ZERO_MONEY,
} from '../../financial';
import { addDays } from '../../dashboard/shared/dashboard-range';
import type { ResolvedReportsPeriod } from '../shared/reports-period';

export const ERP_REPORT_SLICES = [
  'sales-summary', 'sales-by-product', 'sales-by-customer', 'cash-flow', 'profit',
  'inventory-valuation', 'inventory-low-stock', 'suppliers-paid', 'suppliers-not-paid',
] as const;
export type ErpReportSlice = (typeof ERP_REPORT_SLICES)[number];

/** Stock reports describe the shared catalogue, so they are not split by branch. */
export const ERP_STOCK_SLICES = new Set<ErpReportSlice>(['inventory-valuation', 'inventory-low-stock']);

export function isErpReportSlice(slice: string): slice is ErpReportSlice {
  return (ERP_REPORT_SLICES as readonly string[]).includes(slice);
}

const excludedSalesStatuses = [SalesOrderFulfillmentStatus.DRAFT, SalesOrderFulfillmentStatus.CANCELLED];
const money = (value: Decimal) => moneyToApiString(value);
const total = (values: Decimal[]) => sumMoney(values.length ? values : [ZERO_MONEY]);
const toBase = (amount: Decimal, currency: Currency, rate: Decimal) => toBaseAmount(amount, currency, rate, Decimal.ROUND_HALF_UP);
const round2 = (value: Decimal) => value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
const percent = (part: Decimal, whole: Decimal) => (whole.isZero() ? null : part.div(whole).mul(100).toFixed(1));

function boundaries(period: ResolvedReportsPeriod) {
  return { from: businessDateToPrisma(period.from), toExclusive: businessDateToPrisma(addDays(period.to, 1)) };
}

/** Every business date in the period, so daily tables show quiet days too. */
function daysOf(period: ResolvedReportsPeriod): string[] {
  const days: string[] = [];
  for (let day = period.from; day <= period.to && days.length < 400; day = addDays(day, 1)) days.push(day);
  return days;
}

export async function loadErpReport(slice: ErpReportSlice, period: ResolvedReportsPeriod, scope: BranchScope) {
  switch (slice) {
    case 'sales-summary': return salesSummary(period, scope);
    case 'sales-by-product': return salesByProduct(period, scope, false);
    case 'profit': return salesByProduct(period, scope, true);
    case 'sales-by-customer': return salesByCustomer(period, scope);
    case 'cash-flow': return cashFlow(period, scope);
    case 'inventory-valuation': return inventoryValuation();
    case 'inventory-low-stock': return lowStock(period);
    case 'suppliers-paid':
    case 'suppliers-not-paid': return supplierPayments(slice, period, scope);
  }
}

// ---------------------------------------------------------------- sales

async function salesSummary(period: ResolvedReportsPeriod, scope: BranchScope) {
  const { from, toExclusive } = boundaries(period);
  const [orders, returns, payments] = await Promise.all([
    prisma.salesOrder.findMany({
      where: { ...scopeWhere(scope), orderDate: { gte: from, lt: toExclusive }, fulfillmentStatus: { notIn: excludedSalesStatuses } },
      select: { orderDate: true, baseTotalAmount: true, basePaidAmount: true, baseRemainingAmount: true },
    }),
    prisma.salesReturn.findMany({
      where: { ...scopeWhere(scope), returnDate: { gte: from, lt: toExclusive } },
      select: { returnDate: true, baseTotalIncVat: true },
    }),
    prisma.payment.findMany({
      where: { ...scopeWhere(scope), paymentDate: { gte: from, lt: toExclusive }, voidedAt: null },
      select: { paymentDate: true, baseAmount: true },
    }),
  ]);
  const byDay = new Map(daysOf(period).map((day) => [day, {
    orders: 0, gross: [] as Decimal[], returns: [] as Decimal[], collected: [] as Decimal[], unpaid: [] as Decimal[],
  }]));
  const at = (date: Date) => byDay.get(prismaDateToBusinessDate(date));
  for (const order of orders) {
    const day = at(order.orderDate); if (!day) continue;
    day.orders += 1; day.gross.push(order.baseTotalAmount); day.unpaid.push(order.baseRemainingAmount);
  }
  for (const item of returns) at(item.returnDate)?.returns.push(item.baseTotalIncVat);
  for (const payment of payments) at(payment.paymentDate)?.collected.push(payment.baseAmount);

  const rows = [...byDay.entries()].map(([date, day]) => {
    const gross = total(day.gross);
    const returned = total(day.returns);
    return {
      date, orderCount: day.orders, grossSales: money(gross), returns: money(returned),
      netSales: money(subtractMoney(gross, returned)), collected: money(total(day.collected)),
      leftUnpaid: money(total(day.unpaid)),
    };
  });
  const sum = (key: 'grossSales' | 'returns' | 'netSales' | 'collected' | 'leftUnpaid') => money(total(rows.map((row) => new Decimal(row[key]))));
  const orderCount = rows.reduce((count, row) => count + row.orderCount, 0);
  const net = new Decimal(sum('netSales'));
  return {
    summary: {
      orderCount, grossSales: sum('grossSales'), returns: sum('returns'), netSales: sum('netSales'),
      collected: sum('collected'), leftUnpaid: sum('leftUnpaid'),
      averageOrder: money(orderCount ? round2(net.div(orderCount)) : ZERO_MONEY),
    },
    rows,
  };
}

interface ProductAggregate {
  productId: string | null; sku: string | null; name: string; model: string | null;
  units: number; returnedUnits: number; sales: Decimal[]; vat: Decimal[]; returns: Decimal[];
}

/** Sales per product. With `withProfit`, adds cost of goods and gross margin. */
async function salesByProduct(period: ResolvedReportsPeriod, scope: BranchScope, withProfit: boolean) {
  const { from, toExclusive } = boundaries(period);
  const [items, returnItems] = await Promise.all([
    prisma.salesOrderItem.findMany({
      where: { salesOrder: { ...scopeWhere(scope), orderDate: { gte: from, lt: toExclusive }, fulfillmentStatus: { notIn: excludedSalesStatuses } } },
      select: {
        productId: true, productNameSnapshot: true, productModelSnapshot: true, skuSnapshot: true,
        quantity: true, lineTotalIncVat: true, vatAmount: true,
        salesOrder: { select: { currency: true, exchangeRate: true } },
      },
    }),
    prisma.salesReturnItem.findMany({
      where: { salesReturn: { ...scopeWhere(scope), returnDate: { gte: from, lt: toExclusive } } },
      select: { productId: true, quantity: true, baseSubtotalExVat: true, salesOrderItem: { select: { productNameSnapshot: true, productModelSnapshot: true, skuSnapshot: true } } },
    }),
  ]);
  const groups = new Map<string, ProductAggregate>();
  const group = (productId: string | null, name: string, model: string | null, sku: string | null) => {
    const key = productId ?? `manual:${name}|${model ?? ''}`;
    let entry = groups.get(key);
    if (!entry) { entry = { productId, sku, name, model, units: 0, returnedUnits: 0, sales: [], vat: [], returns: [] }; groups.set(key, entry); }
    return entry;
  };
  for (const item of items) {
    const entry = group(item.productId, item.productNameSnapshot, item.productModelSnapshot, item.skuSnapshot);
    const { currency, exchangeRate } = item.salesOrder;
    const vat = toBase(item.vatAmount, currency, exchangeRate);
    entry.units += item.quantity;
    entry.sales.push(subtractMoney(toBase(item.lineTotalIncVat, currency, exchangeRate), vat));
    entry.vat.push(vat);
  }
  for (const item of returnItems) {
    const entry = group(item.productId, item.salesOrderItem.productNameSnapshot, item.salesOrderItem.productModelSnapshot, item.salesOrderItem.skuSnapshot);
    entry.returnedUnits += item.quantity;
    entry.returns.push(item.baseSubtotalExVat);
  }

  const productIds = [...groups.values()].map((entry) => entry.productId).filter((id): id is string => Boolean(id));
  const costs = withProfit && productIds.length
    ? new Map((await prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true, costPrice: true, priceCurrency: true } }))
      .map((product) => [product.id, product.priceCurrency === Currency.USD ? product.costPrice : null]))
    : new Map<string, Decimal | null>();

  const rows = [...groups.values()].map((entry) => {
    const netSales = subtractMoney(total(entry.sales), total(entry.returns));
    const netUnits = entry.units - entry.returnedUnits;
    const base = {
      productId: entry.productId, product: { id: entry.productId, sku: entry.sku, name: entry.name, model: entry.model },
      unitsSold: entry.units, unitsReturned: entry.returnedUnits, netUnits,
      salesExVat: money(total(entry.sales)), vat: money(total(entry.vat)), returns: money(total(entry.returns)),
      netSales: money(netSales), averagePrice: entry.units ? money(round2(total(entry.sales).div(entry.units))) : null,
    };
    if (!withProfit) return base;
    const unitCost = entry.productId ? costs.get(entry.productId) ?? null : null;
    const costOfGoods = unitCost ? unitCost.mul(netUnits) : null;
    const grossProfit = costOfGoods ? subtractMoney(netSales, costOfGoods) : null;
    return {
      ...base, unitCost: unitCost ? money(unitCost) : null, costOfGoods: costOfGoods ? money(costOfGoods) : null,
      grossProfit: grossProfit ? money(grossProfit) : null, marginPercent: grossProfit ? percent(grossProfit, netSales) : null,
    };
  }).sort((left, right) => new Decimal(right.netSales).comparedTo(left.netSales));

  const netSales = total(rows.map((row) => new Decimal(row.netSales)));
  const summary: Record<string, unknown> = {
    productCount: rows.length, unitsSold: rows.reduce((sum, row) => sum + row.unitsSold, 0),
    netUnits: rows.reduce((sum, row) => sum + row.netUnits, 0),
    salesExVat: money(total(rows.map((row) => new Decimal(row.salesExVat)))), vat: money(total(rows.map((row) => new Decimal(row.vat)))),
    returns: money(total(rows.map((row) => new Decimal(row.returns)))), netSales: money(netSales),
  };
  if (withProfit) {
    const costed = rows.filter((row) => 'grossProfit' in row && row.grossProfit !== null) as Array<typeof rows[number] & { costOfGoods: string; grossProfit: string }>;
    const costedSales = total(costed.map((row) => new Decimal(row.netSales)));
    const grossProfit = total(costed.map((row) => new Decimal(row.grossProfit)));
    Object.assign(summary, {
      costOfGoods: money(total(costed.map((row) => new Decimal(row.costOfGoods)))), grossProfit: money(grossProfit),
      marginPercent: percent(grossProfit, costedSales), productsWithoutCost: rows.length - costed.length,
      costBasis: 'CURRENT_PRODUCT_COST',
    });
  }
  return { summary, rows };
}

async function salesByCustomer(period: ResolvedReportsPeriod, scope: BranchScope) {
  const { from, toExclusive } = boundaries(period);
  const orders = await prisma.salesOrder.findMany({
    where: { ...scopeWhere(scope), orderDate: { gte: from, lt: toExclusive }, fulfillmentStatus: { notIn: excludedSalesStatuses } },
    select: { orderDate: true, baseTotalAmount: true, basePaidAmount: true, baseRemainingAmount: true, customer: { select: { id: true, name: true, phone: true } } },
  });
  const groups = new Map<string, { customer: { id: string | null; name: string; phone: string | null }; orders: number; sales: Decimal[]; paid: Decimal[]; owed: Decimal[]; last: string }>();
  for (const order of orders) {
    const key = order.customer?.id ?? 'walk-in';
    const date = prismaDateToBusinessDate(order.orderDate);
    const entry = groups.get(key) ?? { customer: order.customer ?? { id: null, name: 'Walk-in customers', phone: null }, orders: 0, sales: [], paid: [], owed: [], last: date };
    entry.orders += 1; entry.sales.push(order.baseTotalAmount); entry.paid.push(order.basePaidAmount); entry.owed.push(order.baseRemainingAmount);
    if (date > entry.last) entry.last = date;
    groups.set(key, entry);
  }
  const grand = total(orders.map((order) => order.baseTotalAmount));
  const rows = [...groups.values()].map((entry) => ({
    customer: entry.customer, orderCount: entry.orders, sales: money(total(entry.sales)), paid: money(total(entry.paid)),
    stillOwed: money(total(entry.owed)), lastOrderDate: entry.last, shareOfSales: percent(total(entry.sales), grand),
  })).sort((left, right) => new Decimal(right.sales).comparedTo(left.sales));
  return {
    summary: {
      customerCount: rows.filter((row) => row.customer.id).length, orderCount: orders.length, sales: money(grand),
      paid: money(total(rows.map((row) => new Decimal(row.paid)))), stillOwed: money(total(rows.map((row) => new Decimal(row.stillOwed)))),
    },
    rows,
  };
}

// ---------------------------------------------------------------- cash flow

const CUSTOMER_METHOD_LABELS: Record<PaymentMethod, string> = { CASH: 'Cash', CARD: 'Card', BANK_TRANSFER: 'Bank transfer', OTHER: 'Other' };
const SUPPLIER_METHOD_LABELS: Record<string, string> = { CASH_USD: 'Cash (USD)', CASH_LBP: 'Cash (LBP)', CHEQUE: 'Cheque', BANK_TRANSFER: 'Bank transfer', UNSPECIFIED: 'Not specified' };

/**
 * Cash-basis statement: money actually received from customers against money
 * actually paid to suppliers and refunded to customers, day by day.
 */
async function cashFlow(period: ResolvedReportsPeriod, scope: BranchScope) {
  const { from, toExclusive } = boundaries(period);
  const [payments, supplierPayments, refunds] = await Promise.all([
    prisma.payment.findMany({
      where: { ...scopeWhere(scope), paymentDate: { gte: from, lt: toExclusive }, voidedAt: null },
      select: { paymentDate: true, baseAmount: true, paymentMethod: true },
    }),
    prisma.supplierTransaction.findMany({
      where: { ...scopeWhere(scope), status: SupplierTransactionStatus.ACTIVE, type: SupplierTransactionType.SUPPLIER_PAYMENT, transactionDate: { gte: from, lt: toExclusive } },
      select: { transactionDate: true, baseAmount: true, paymentMethod: true },
    }),
    prisma.salesReturn.findMany({
      where: { ...scopeWhere(scope), returnDate: { gte: from, lt: toExclusive }, refundMethod: SalesReturnRefundMethod.CASH_OUT },
      select: { returnDate: true, baseRefundableAmount: true },
    }),
  ]);
  const byDay = new Map(daysOf(period).map((day) => [day, { received: [] as Decimal[], supplierPaid: [] as Decimal[], refunded: [] as Decimal[] }]));
  const inByMethod = new Map<string, Decimal[]>();
  const outByMethod = new Map<string, Decimal[]>();
  const push = (map: Map<string, Decimal[]>, key: string, value: Decimal) => map.set(key, [...(map.get(key) ?? []), value]);
  for (const payment of payments) {
    byDay.get(prismaDateToBusinessDate(payment.paymentDate))?.received.push(payment.baseAmount);
    push(inByMethod, CUSTOMER_METHOD_LABELS[payment.paymentMethod], payment.baseAmount);
  }
  for (const payment of supplierPayments) {
    byDay.get(prismaDateToBusinessDate(payment.transactionDate))?.supplierPaid.push(payment.baseAmount);
    push(outByMethod, `Supplier payments · ${SUPPLIER_METHOD_LABELS[payment.paymentMethod ?? 'UNSPECIFIED']}`, payment.baseAmount);
  }
  for (const refund of refunds) {
    byDay.get(prismaDateToBusinessDate(refund.returnDate))?.refunded.push(refund.baseRefundableAmount);
    push(outByMethod, 'Cash refunds to customers', refund.baseRefundableAmount);
  }
  let running = ZERO_MONEY;
  const rows = [...byDay.entries()].map(([date, day]) => {
    const moneyIn = total(day.received);
    const moneyOut = sumMoney([total(day.supplierPaid), total(day.refunded)]);
    const net = subtractMoney(moneyIn, moneyOut);
    running = sumMoney([running, net]);
    return {
      date, customerPayments: money(moneyIn), supplierPayments: money(total(day.supplierPaid)), customerRefunds: money(total(day.refunded)),
      moneyIn: money(moneyIn), moneyOut: money(moneyOut), netCashFlow: money(net), cumulativeNet: money(running),
    };
  });
  const breakdown = (map: Map<string, Decimal[]>) => [...map.entries()].map(([label, values]) => ({ label, amount: money(total(values)) }))
    .sort((left, right) => new Decimal(right.amount).comparedTo(left.amount));
  const moneyIn = total(rows.map((row) => new Decimal(row.moneyIn)));
  const moneyOut = total(rows.map((row) => new Decimal(row.moneyOut)));
  return {
    summary: {
      moneyIn: money(moneyIn), moneyOut: money(moneyOut), netCashFlow: money(subtractMoney(moneyIn, moneyOut)),
      supplierPayments: money(total(rows.map((row) => new Decimal(row.supplierPayments)))),
      customerRefunds: money(total(rows.map((row) => new Decimal(row.customerRefunds)))),
      inByMethod: breakdown(inByMethod), outByMethod: breakdown(outByMethod),
    },
    rows,
  };
}

// ---------------------------------------------------------------- stock

async function inventoryValuation() {
  const products = await prisma.product.findMany({
    where: { isActive: true, trackStock: true, stockQuantity: { gt: 0 } },
    select: { id: true, sku: true, name: true, model: true, stockQuantity: true, costPrice: true, price: true, priceCurrency: true },
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
  });
  const rows = products.map((product) => {
    const usd = product.priceCurrency === Currency.USD;
    const cost = usd && product.costPrice ? product.costPrice : null;
    const price = usd && product.price ? product.price : null;
    return {
      productId: product.id, product: { id: product.id, sku: product.sku, name: product.name, model: product.model },
      onHand: product.stockQuantity, unitCost: cost ? money(cost) : null, stockValue: cost ? money(cost.mul(product.stockQuantity)) : null,
      unitPrice: price ? money(price) : null, retailValue: price ? money(price.mul(product.stockQuantity)) : null,
    };
  }).sort((left, right) => new Decimal(right.stockValue ?? '0').comparedTo(left.stockValue ?? '0'));
  const stockValue = total(rows.flatMap((row) => (row.stockValue ? [new Decimal(row.stockValue)] : [])));
  const retailValue = total(rows.flatMap((row) => (row.retailValue ? [new Decimal(row.retailValue)] : [])));
  return {
    operationalSnapshot: true,
    summary: {
      productCount: rows.length, unitsOnHand: rows.reduce((sum, row) => sum + row.onHand, 0),
      stockValue: money(stockValue), retailValue: money(retailValue), potentialProfit: money(subtractMoney(retailValue, stockValue)),
      productsWithoutCost: rows.filter((row) => !row.stockValue).length, costBasis: 'CURRENT_PRODUCT_COST',
    },
    rows,
  };
}

async function lowStock(period: ResolvedReportsPeriod) {
  const { from, toExclusive } = boundaries(period);
  const [products, sold] = await Promise.all([
    prisma.product.findMany({
      where: { isActive: true, trackStock: true, lowStockThreshold: { not: null } },
      select: { id: true, sku: true, name: true, model: true, stockQuantity: true, lowStockThreshold: true, costPrice: true, priceCurrency: true },
    }),
    prisma.stockMovement.groupBy({
      by: ['productId'], where: { movementType: 'SALE_FULFILLMENT', createdAt: { gte: from, lt: toExclusive } }, _sum: { quantityChange: true },
    }),
  ]);
  const soldBy = new Map(sold.map((row) => [row.productId, Math.abs(row._sum.quantityChange ?? 0)]));
  const rows = products.filter((product) => product.stockQuantity <= (product.lowStockThreshold ?? 0)).map((product) => {
    const threshold = product.lowStockThreshold ?? 0;
    // Bring stock back to twice the alert level, a common simple reorder rule.
    const suggestedOrder = Math.max(0, threshold * 2 - product.stockQuantity);
    const cost = product.priceCurrency === Currency.USD ? product.costPrice : null;
    return {
      productId: product.id, product: { id: product.id, sku: product.sku, name: product.name, model: product.model },
      onHand: product.stockQuantity, reorderLevel: threshold, soldInPeriod: soldBy.get(product.id) ?? 0,
      suggestedOrder, estimatedCost: cost ? money(cost.mul(suggestedOrder)) : null,
      status: product.stockQuantity <= 0 ? 'OUT_OF_STOCK' : 'LOW',
    };
  }).sort((left, right) => left.onHand - right.onHand || right.soldInPeriod - left.soldInPeriod);
  return {
    operationalSnapshot: true,
    summary: {
      count: rows.length, outOfStock: rows.filter((row) => row.status === 'OUT_OF_STOCK').length,
      suggestedUnits: rows.reduce((sum, row) => sum + row.suggestedOrder, 0),
      estimatedCost: money(total(rows.flatMap((row) => (row.estimatedCost ? [new Decimal(row.estimatedCost)] : [])))),
    },
    rows,
  };
}

// ---------------------------------------------------------------- suppliers

/** Per supplier: what we owed at the start, new bills, what we paid, and what we owe now. */
async function supplierPayments(slice: 'suppliers-paid' | 'suppliers-not-paid', period: ResolvedReportsPeriod, scope: BranchScope) {
  const { from, toExclusive } = boundaries(period);
  const transactions = await prisma.supplierTransaction.findMany({
    where: { ...scopeWhere(scope), status: SupplierTransactionStatus.ACTIVE, transactionDate: { lt: toExclusive } },
    select: { transactionDate: true, baseAmount: true, direction: true, type: true, supplier: { select: { id: true, name: true, phone: true } } },
  });
  const groups = new Map<string, { supplier: { id: string; name: string; phone: string }; opening: Decimal; billed: Decimal[]; paid: Decimal[]; credits: Decimal[]; payments: number; lastPayment: string | null }>();
  for (const row of transactions) {
    const entry = groups.get(row.supplier.id) ?? { supplier: row.supplier, opening: ZERO_MONEY, billed: [], paid: [], credits: [], payments: 0, lastPayment: null };
    const signed = row.direction === SupplierTransactionDirection.INCREASE_OWED ? row.baseAmount : row.baseAmount.neg();
    const date = prismaDateToBusinessDate(row.transactionDate);
    if (row.type === SupplierTransactionType.SUPPLIER_PAYMENT && (!entry.lastPayment || date > entry.lastPayment)) entry.lastPayment = date;
    if (row.transactionDate < from) entry.opening = sumMoney([entry.opening, signed]);
    else if (row.type === SupplierTransactionType.SUPPLIER_PAYMENT) { entry.paid.push(row.baseAmount); entry.payments += 1; }
    else if (row.direction === SupplierTransactionDirection.INCREASE_OWED) entry.billed.push(row.baseAmount);
    else entry.credits.push(row.baseAmount);
    groups.set(row.supplier.id, entry);
  }
  const rows = [...groups.values()].map((entry) => {
    const closing = subtractMoney(sumMoney([entry.opening, total(entry.billed)]), sumMoney([total(entry.paid), total(entry.credits)]));
    return {
      supplier: entry.supplier, openingBalance: money(entry.opening), billed: money(total(entry.billed)), paid: money(total(entry.paid)),
      credits: money(total(entry.credits)), closingBalance: money(closing), paymentCount: entry.payments, lastPaymentDate: entry.lastPayment,
    };
  }).filter((row) => (slice === 'suppliers-paid' ? row.paymentCount > 0 : row.paymentCount === 0 && new Decimal(row.closingBalance).greaterThan(ZERO_MONEY)))
    .sort((left, right) => new Decimal(right.closingBalance).comparedTo(left.closingBalance));
  const sum = (key: 'openingBalance' | 'billed' | 'paid' | 'credits' | 'closingBalance') => money(total(rows.map((row) => new Decimal(row[key]))));
  return {
    summary: {
      count: rows.length, openingBalance: sum('openingBalance'), billed: sum('billed'), paid: sum('paid'), closingBalance: sum('closingBalance'),
      ...(slice === 'suppliers-paid' ? { paymentCount: rows.reduce((count, row) => count + row.paymentCount, 0) } : {}),
    },
    rows,
  };
}

// ---------------------------------------------------------------- CSV

type CsvCell = string | number | boolean | null | undefined;
const name = (value: unknown) => (value as { name?: string } | null)?.name;
const sku = (value: unknown) => (value as { sku?: string | null } | null)?.sku;

export const ERP_CSV: Record<ErpReportSlice, { headers: string[]; values: (row: Record<string, unknown>) => CsvCell[] }> = {
  'sales-summary': { headers: ['Date', 'Orders', 'Gross sales', 'Returns', 'Net sales', 'Collected', 'Left unpaid'], values: (r) => [r.date as string, r.orderCount as number, r.grossSales as string, r.returns as string, r.netSales as string, r.collected as string, r.leftUnpaid as string] },
  'sales-by-product': { headers: ['SKU', 'Product', 'Units sold', 'Units returned', 'Net units', 'Sales ex VAT', 'VAT', 'Returns', 'Net sales', 'Average price'], values: (r) => [sku(r.product), name(r.product), r.unitsSold as number, r.unitsReturned as number, r.netUnits as number, r.salesExVat as string, r.vat as string, r.returns as string, r.netSales as string, r.averagePrice as string | null] },
  'sales-by-customer': { headers: ['Customer', 'Phone', 'Orders', 'Sales', 'Paid', 'Still owed', 'Last order', 'Share %'], values: (r) => [name(r.customer), (r.customer as { phone?: string | null }).phone, r.orderCount as number, r.sales as string, r.paid as string, r.stillOwed as string, r.lastOrderDate as string, r.shareOfSales as string | null] },
  'cash-flow': { headers: ['Date', 'Customer payments', 'Supplier payments', 'Customer refunds', 'Money in', 'Money out', 'Net cash flow', 'Cumulative net'], values: (r) => [r.date as string, r.customerPayments as string, r.supplierPayments as string, r.customerRefunds as string, r.moneyIn as string, r.moneyOut as string, r.netCashFlow as string, r.cumulativeNet as string] },
  profit: { headers: ['SKU', 'Product', 'Net units', 'Net sales ex VAT', 'Unit cost', 'Cost of goods', 'Gross profit', 'Margin %'], values: (r) => [sku(r.product), name(r.product), r.netUnits as number, r.netSales as string, r.unitCost as string | null, r.costOfGoods as string | null, r.grossProfit as string | null, r.marginPercent as string | null] },
  'inventory-valuation': { headers: ['SKU', 'Product', 'On hand', 'Unit cost', 'Stock value', 'Unit price', 'Retail value'], values: (r) => [sku(r.product), name(r.product), r.onHand as number, r.unitCost as string | null, r.stockValue as string | null, r.unitPrice as string | null, r.retailValue as string | null] },
  'inventory-low-stock': { headers: ['SKU', 'Product', 'On hand', 'Reorder level', 'Sold in period', 'Suggested order', 'Estimated cost', 'Status'], values: (r) => [sku(r.product), name(r.product), r.onHand as number, r.reorderLevel as number, r.soldInPeriod as number, r.suggestedOrder as number, r.estimatedCost as string | null, r.status as string] },
  'suppliers-paid': { headers: ['Supplier', 'Phone', 'Opening balance', 'Billed', 'Paid', 'Credits', 'Balance now', 'Payments', 'Last payment'], values: supplierCsv },
  'suppliers-not-paid': { headers: ['Supplier', 'Phone', 'Opening balance', 'Billed', 'Paid', 'Credits', 'Balance now', 'Payments', 'Last payment'], values: supplierCsv },
};

function supplierCsv(r: Record<string, unknown>): CsvCell[] {
  const supplier = r.supplier as { name: string; phone: string };
  return [supplier.name, supplier.phone, r.openingBalance as string, r.billed as string, r.paid as string, r.credits as string, r.closingBalance as string, r.paymentCount as number, r.lastPaymentDate as string | null];
}
