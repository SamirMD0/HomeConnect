import { isIsolatedTestDatabase } from '../../../test/database';
import { Currency, PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SalesOrdersService } from './sales-orders.service';
import { createSalesOrderSchema } from './sales-orders.validator';
import { todayInBusinessTimezone } from '../../financial/domain/business-date';
import { CustomerFinancialSummaryService } from '../../financial/customer-summary/customer-financial-summary.service';
import { customerFinancialSummaryQuerySchema } from '../../financial/customer-summary/customer-financial-summary.validator';
import { CustomerStatementService } from '../../financial/customer-statement/customer-statement.service';
import { ReportRowsService } from '../../reports/rows/report-rows.service';
import { MonthlyDebtsService } from '../../reports/monthly-debts/monthly-debts.service';
import * as salesAudit from '../audit/sales-audit';
import * as adminVerification from '../../../lib/admin-verification';
import { PaymentsService } from '../../financial/payments/payments.service';
import { CustomerAnalyticsService } from '../../dashboard/customer/customer-analytics.service';
import { resolveDashboardRange } from '../../dashboard/shared/dashboard-range';


const describeDb = process.env.RUN_SALES_FULFILLMENT_DB_TESTS === '1' && isIsolatedTestDatabase(process.env.DATABASE_URL) ? describe : describe.skip;
const db = new PrismaClient();
let userId: string;
let customerId: string;
let taxRateId: string;
let taxProfileId: string;
const today = todayInBusinessTimezone();
const summaryQuery = () => customerFinancialSummaryQuerySchema.parse({ includePayments: 'true' });
const command = (overrides: Record<string, unknown> = {}) => createSalesOrderSchema.parse({
  idempotencyKey: randomUUID(), salesChannel: 'SHOP_DIRECT', orderDate: today, fulfillmentStatus: 'DELIVERED',
  currency: 'USD', exchangeRate: '1.000000', paidAmount: '100.00',
  items: [{ manualProductName: 'Counter appliance', quantity: 1, unitPrice: '100.00', taxProfileId, priceIncludesVat: true }],
  ...overrides,
});

describeDb('new counter Payment invariants (INV-09)', () => {
  beforeEach(async () => {
    userId = randomUUID(); customerId = randomUUID(); taxRateId = randomUUID(); taxProfileId = randomUUID();
    await db.user.create({ data: { id: userId, username: `counter-${userId}`, fullName: 'Counter Test Admin', password: 'unused', role: 'ADMIN' } });
    await db.customer.create({ data: { id: customerId, name: 'Counter Named Customer', phone: `counter-${customerId}`, createdBy: userId } });
    await db.taxRate.create({ data: { id: taxRateId, code: `COUNTER_${taxRateId}`, name: 'Counter 11%', nameAr: 'اختبار', ratePercent: '11.000', effectiveFrom: new Date('2020-01-01'), createdById: userId } });
    await db.taxProfile.create({ data: { id: taxProfileId, code: `COUNTER_${taxProfileId}`, name: 'Counter VAT', nameAr: 'اختبار', taxRateId } });
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await db.salesAudit.deleteMany({ where: { changedById: userId } });
    await db.paymentAllocation.deleteMany({ where: { payment: { createdById: userId } } });
    await db.payment.deleteMany({ where: { createdById: userId } });
    await db.salesOrderItem.deleteMany({ where: { salesOrder: { createdById: userId } } });
    await db.salesOrder.deleteMany({ where: { createdById: userId } });
    await db.debt.deleteMany({ where: { createdById: userId } });
    await db.customer.deleteMany({ where: { id: customerId } });
    await db.taxProfile.deleteMany({ where: { id: taxProfileId } });
    await db.taxRate.deleteMany({ where: { id: taxRateId } });
    await db.user.delete({ where: { id: userId } });
  }, 30_000);
  afterAll(() => db.$disconnect());

  it.each([Currency.USD, Currency.LBP])('creates exactly one %s walk-in Payment with original FX/VAT/source, without changing a named balance', async (currency) => {
    const before = await CustomerFinancialSummaryService.getCustomerFinancialSummary(customerId, summaryQuery());
    const gross = currency === Currency.USD ? '100.00' : '8950000';
    const rate = currency === Currency.USD ? '1.000000' : '89500.000000';
    const input = command({ currency, exchangeRate: rate, paidAmount: gross,
      items: [{ manualProductName: 'Counter appliance', quantity: 1, unitPrice: gross, taxProfileId, priceIncludesVat: true }],
    });
    const sale = await SalesOrdersService.create(input, { userId, role: 'ADMIN' }, {});
    const payments = await db.payment.findMany({ where: { createdById: userId } });
    expect(payments).toHaveLength(1);
    expect(payments[0]).toMatchObject({ customerId: null, salesOrderId: sale.id, currency, paymentMethod: 'CASH' });
    expect(payments[0].exchangeRate.toFixed(6)).toBe(rate);
    expect(payments[0].baseAmount.toFixed(2)).toBe('100.00');
    expect(JSON.stringify(payments[0].sourceSnapshot)).toContain(sale.orderNumber);
    expect(JSON.stringify(payments[0].sourceSnapshot)).toContain('11.000');
    const receipt = await PaymentsService.getReceipt(payments[0].id);
    expect(receipt.customer).toBeNull();
    expect(receipt.sourceSalesOrder?.id).toBe(sale.id);
    expect(receipt.currency).toBe(currency);
    expect(receipt.sourceSnapshot).toEqual(payments[0].sourceSnapshot);
    await db.taxRate.update({ where: { id: taxRateId }, data: { ratePercent: '22.000' } });
    expect((await PaymentsService.getReceipt(payments[0].id)).sourceSnapshot).toEqual(receipt.sourceSnapshot);
    expect((await SalesOrdersService.create(input, { userId, role: 'ADMIN' }, {})).id).toBe(sale.id);
    expect(await db.payment.count({ where: { salesOrderId: sale.id } })).toBe(1);
    await expect(db.salesOrder.update({ where: { id: sale.id }, data: { customerId } })).rejects.toThrow();
    expect(await db.paymentAllocation.count({ where: { paymentId: payments[0].id } })).toBe(0);
    const after = await CustomerFinancialSummaryService.getCustomerFinancialSummary(customerId, summaryQuery());
    expect(after.summary.totalOutstanding).toBe(before.summary.totalOutstanding);
    expect(after.recentPayments).toEqual(before.recentPayments);
    expect((await CustomerStatementService.get(customerId, { from: today, to: today })).entries).toHaveLength(0);
    expect(JSON.stringify(await db.salesAudit.findMany({ where: { salesOrderId: sale.id } }))).toContain(payments[0].id);
  }, 30_000);

  it.each([Currency.USD, Currency.LBP])('records a named partial %s receipt once, with only the remainder becoming outstanding', async (currency) => {
    const gross = currency === Currency.USD ? '100.00' : '8950000';
    const paid = currency === Currency.USD ? '25.00' : '2237500';
    const remaining = currency === Currency.USD ? '75.00' : '6712500';
    const rate = currency === Currency.USD ? '1.000000' : '89500.000000';
    const sale = await SalesOrdersService.create(command({ customerId, currency, exchangeRate: rate, paidAmount: paid, debtDueDate: today,
      items: [{ manualProductName: 'Counter appliance', quantity: 1, unitPrice: gross, taxProfileId, priceIncludesVat: true }],
    }), { userId, role: 'ADMIN' }, {});
    const payment = await db.payment.findFirstOrThrow({ where: { createdById: userId } });
    expect(payment.customerId).toBe(customerId);
    expect(payment.totalAmount.toFixed(currency === Currency.USD ? 2 : 0)).toBe(paid);
    expect(payment.baseAmount.toFixed(2)).toBe('25.00');
    const debt = await db.debt.findUniqueOrThrow({ where: { id: sale.debtId! } });
    expect(debt.originalAmount.toFixed(currency === Currency.USD ? 2 : 0)).toBe(remaining);
    expect(debt.currency).toBe(currency);
    expect(debt.exchangeRate.toFixed(6)).toBe(rate);
    expect(debt.baseOriginalAmount.toFixed(2)).toBe('75.00');
    const summary = await CustomerFinancialSummaryService.getCustomerFinancialSummary(customerId, summaryQuery());
    expect(summary.summary.totalOutstanding).toBe('75.00');
    expect(summary.recentPayments.map((p) => p.id)).toContain(payment.id);
    expect(summary.recentPayments.find((p) => p.id === payment.id)).toMatchObject({ currency, exchangeRate: rate, baseAmount: '25.00', sourceSalesOrderId: sale.id });
    const statement = await CustomerStatementService.get(customerId, { from: today, to: today });
    expect(statement.closingBalance).toBe('75.00');
    expect(statement.entries.find((e) => e.id === payment.id)?.balanceEffect).toBe('0.00');
  }, 30_000);

  it('includes walk-in cash exactly once in payment reports and collected totals', async () => {
    const query = { period: 'custom' as const, from: today, to: today };
    const before = await ReportRowsService.get('customers-payments', query);
    const beforeActivity = await MonthlyDebtsService.getFinancialActivityForRange({ month: today.slice(0, 7), page: 1, limit: 10000 }, today, today);
    const range = resolveDashboardRange({ range: 'custom', from: today, to: today }, today);
    const beforeDashboard = await CustomerAnalyticsService.get(range, { includeArchived: false, includeAdminData: true, businessDate: today });
    const sale = await SalesOrdersService.create(command(), { userId, role: 'ADMIN' }, {});
    const after = await ReportRowsService.get('customers-payments', query);
    expect(Number((after.data.summary as { totalAmount: string }).totalAmount) - Number((before.data.summary as { totalAmount: string }).totalAmount)).toBe(100);
    const own = after.data.rows.filter((r) => (r as { sourceSalesOrder?: { id: string } }).sourceSalesOrder?.id === sale.id);
    expect(own).toHaveLength(1);
    const activity = await MonthlyDebtsService.getFinancialActivityForRange({ month: today.slice(0, 7), page: 1, limit: 10000 }, today, today);
    expect(Number(activity.summary.paymentsReceived) - Number(beforeActivity.summary.paymentsReceived)).toBe(100);
    expect(Number(activity.summary.counterReceipts) - Number(beforeActivity.summary.counterReceipts)).toBe(100);
    const dashboard = await CustomerAnalyticsService.get(range, { includeArchived: false, includeAdminData: true, businessDate: today });
    expect(Number(dashboard.totals.collected) - Number(beforeDashboard.totals.collected)).toBe(100);
    expect(Number(dashboard.today.collected) - Number(beforeDashboard.today.collected)).toBe(100);
    expect(dashboard.totals.distinctPayers).toBe(beforeDashboard.totals.distinctPayers);
    const csv = await ReportRowsService.exportCsv('customers-payments', query);
    expect(csv.csv).toContain('Walk-in / زبون عابر');
    const payers = await ReportRowsService.get('customers-paid', query);
    expect(payers.data.rows.some((r) => (r as { customer: { id: string } }).customer?.id == null)).toBe(false);
  }, 30_000);

  it('replays sequential and concurrent identical submissions, and rejects conflicting key reuse', async () => {
    const input = command();
    const results = await Promise.all([SalesOrdersService.create(input, { userId, role: 'ADMIN' }, {}), SalesOrdersService.create(input, { userId, role: 'ADMIN' }, {})]);
    expect(results[0].id).toBe(results[1].id);
    expect((await SalesOrdersService.create(input, { userId, role: 'ADMIN' }, {})).id).toBe(results[0].id);
    expect(await db.salesOrder.count({ where: { createdById: userId } })).toBe(1);
    expect(await db.payment.count({ where: { createdById: userId } })).toBe(1);
    await expect(SalesOrdersService.create({ ...input, notes: 'Different command' }, { userId, role: 'ADMIN' }, {})).rejects.toThrow();
  }, 30_000);

  it('rolls back sale, remainder debt, Payment, and audit together on audit failure', async () => {
    vi.spyOn(salesAudit, 'writeSalesAudit').mockRejectedValue(new Error('Injected audit failure'));
    await expect(SalesOrdersService.create(command({ customerId, paidAmount: '25.00', debtDueDate: today }), { userId, role: 'ADMIN' }, {})).rejects.toThrow('Injected audit failure');
    expect(await db.salesOrder.count({ where: { createdById: userId } })).toBe(0);
    expect(await db.payment.count({ where: { createdById: userId } })).toBe(0);
    expect(await db.debt.count({ where: { createdById: userId } })).toBe(0);
  }, 30_000);

  it('records only new cash deltas on an unlinked draft, with concurrent replay and immutable earlier receipts', async () => {
    vi.spyOn(adminVerification, 'verifyAdminPassword').mockResolvedValue(undefined);
    const sale = await SalesOrdersService.create(command({ customerId, paidAmount: '0.00', fulfillmentStatus: 'DRAFT' }), { userId, role: 'ADMIN' }, {});
    const cash = { paidAmount: '25.00', reason: 'New counter receipt', accountPassword: 'unused', idempotencyKey: randomUUID() };
    await Promise.all([SalesOrdersService.changePayment(sale.id, cash, { userId, role: 'ADMIN' }, {}), SalesOrdersService.changePayment(sale.id, cash, { userId, role: 'ADMIN' }, {})]);
    const first = await db.payment.findFirstOrThrow({ where: { salesOrderId: sale.id } });
    expect(first.totalAmount.toFixed(2)).toBe('25.00');
    expect(await db.payment.count({ where: { salesOrderId: sale.id } })).toBe(1);
    await SalesOrdersService.changePayment(sale.id, { ...cash, paidAmount: '100.00', idempotencyKey: randomUUID() }, { userId, role: 'ADMIN' }, {});
    const payments = await db.payment.findMany({ where: { salesOrderId: sale.id } });
    expect(payments).toHaveLength(2);
    expect(payments.reduce((sum, payment) => sum + Number(payment.totalAmount), 0)).toBe(100);
    expect(await db.payment.findUnique({ where: { id: first.id } })).toEqual(first);
    expect((await CustomerFinancialSummaryService.getCustomerFinancialSummary(customerId, summaryQuery())).summary.totalOutstanding).toBe('0.00');
  }, 30_000);

  it('does not rewrite historical Payments and rejects customerless receipts for named sales', async () => {
    const old = await db.payment.create({ data: { customerId, totalAmount: '7.00', baseAmount: '7.00', paymentDate: new Date('2020-01-01'), createdById: userId } });
    const sale = await SalesOrdersService.create(command({ customerId }), { userId, role: 'ADMIN' }, {});
    expect(await db.payment.findUnique({ where: { id: old.id } })).toEqual(old);
    await expect(db.payment.create({ data: { customerId: null, salesOrderId: sale.id, sourceSnapshot: {}, totalAmount: '1.00', baseAmount: '1.00', paymentDate: new Date(today), createdById: userId } })).rejects.toThrow();
    await expect(db.payment.create({ data: { customerId: null, totalAmount: '1.00', baseAmount: '1.00', paymentDate: new Date(today), createdById: userId } })).rejects.toThrow();
  }, 30_000);
});
