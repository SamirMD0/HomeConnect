import { isIsolatedTestDatabase } from '../../../test/database';
import { Currency, PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcrypt';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DebtsService } from '../debts/debts.service';
import { SalesOrdersService } from '../../sales/sales-orders/sales-orders.service';
import { createSalesOrderSchema } from '../../sales/sales-orders/sales-orders.validator';
import { CustomerFinancialSummaryService } from '../customer-summary/customer-financial-summary.service';
import { customerFinancialSummaryQuerySchema } from '../customer-summary/customer-financial-summary.validator';
import { todayInBusinessTimezone } from '../domain/business-date';
import { CustomersService } from '../../../services/customers.service';
import { CreditLimitService } from './credit-limit.service';


const describeDb = process.env.RUN_FINANCIAL_DB_TESTS === '1' && isIsolatedTestDatabase(process.env.DATABASE_URL) ? describe : describe.skip;
const db = new PrismaClient();
let userId: string; let customerId: string; let taxProfileId: string; let taxRateId: string;
const today = todayInBusinessTimezone();
const password = 'credit-test-password';
const actor = () => ({ userId, role: 'ADMIN' });
const debt = (amount: string, extra: Record<string, unknown> = {}) => ({ amount, description: 'Credit appliance', dueDate: today, ...extra });
const outstanding = async () => (await CustomerFinancialSummaryService.getCustomerFinancialSummary(customerId, customerFinancialSummaryQuerySchema.parse({}))).summary.totalOutstanding;
const sale = (extra: Record<string, unknown> = {}) => createSalesOrderSchema.parse({
  customerId, idempotencyKey: randomUUID(), salesChannel: 'SHOP_DIRECT', orderDate: today,
  fulfillmentStatus: 'DELIVERED', paidAmount: '25.00', debtDueDate: today, currency: 'USD', exchangeRate: '1.000000',
  items: [{ manualProductName: 'Credit appliance', quantity: 1, unitPrice: '100.00', taxProfileId, priceIncludesVat: true }], ...extra,
});

describeDb('customer credit-limit transaction invariants', () => {
  beforeEach(async () => {
    userId = randomUUID(); customerId = randomUUID(); taxProfileId = randomUUID(); taxRateId = randomUUID();
    await db.user.create({ data: { id: userId, username: `credit-${userId}`, fullName: 'Credit Test Admin', password: await bcrypt.hash(password, 4), role: 'ADMIN' } });
    await db.customer.create({ data: { id: customerId, name: 'Credit Customer', phone: `credit-${customerId}`, createdBy: userId } });
    await db.taxRate.create({ data: { id: taxRateId, code: `CREDIT_${taxRateId}`, name: 'Credit VAT', nameAr: 'اختبار', ratePercent: '11', effectiveFrom: new Date('2020-01-01'), createdById: userId } });
    await db.taxProfile.create({ data: { id: taxProfileId, code: `CREDIT_${taxProfileId}`, name: 'Credit VAT', nameAr: 'اختبار', taxRateId } });
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await db.activityLog.deleteMany({ where: { userId } });
    await db.adminVerificationLog.deleteMany({ where: { userId } });
    await db.salesAudit.deleteMany({ where: { changedById: userId } });
    await db.paymentAllocation.deleteMany({ where: { payment: { createdById: userId } } });
    await db.payment.deleteMany({ where: { createdById: userId } });
    await db.salesOrderItem.deleteMany({ where: { salesOrder: { createdById: userId } } });
    await db.salesOrder.deleteMany({ where: { createdById: userId } });
    await db.installment.deleteMany({ where: { installmentPlan: { createdById: userId } } });
    await db.installmentPlan.deleteMany({ where: { createdById: userId } });
    await db.debt.deleteMany({ where: { createdById: userId } });
    await db.customer.deleteMany({ where: { createdBy: userId } });
    await db.taxProfile.deleteMany({ where: { id: taxProfileId } });
    await db.taxRate.deleteMany({ where: { id: taxRateId } });
    await db.user.delete({ where: { id: userId } });
  }, 30_000);
  afterAll(() => db.$disconnect());

  it('preserves NULL/unrestricted creation and supports setting, clearing, and zero limits', async () => {
    expect((await db.customer.findUniqueOrThrow({ where: { id: customerId } })).creditLimit).toBeNull();
    await DebtsService.createDebt(customerId, debt('1000'), actor());
    await CustomersService.updateCustomer(customerId, { creditLimit: '0.00' }, actor());
    await expect(DebtsService.createDebt(customerId, debt('1'), actor())).rejects.toMatchObject({ code: 'CREDIT_LIMIT_EXCEEDED' });
    await CustomersService.updateCustomer(customerId, { creditLimit: null }, actor());
    await DebtsService.createDebt(customerId, debt('1'), actor());
    const created = await CustomersService.createCustomer({ name: 'Limit Customer', phone: `new-${customerId}`, createdBy: userId, creditLimit: '100.00' }, actor());
    expect(created.creditLimit?.toFixed(2)).toBe('100.00');
    await expect(db.customer.update({ where: { id: customerId }, data: { creditLimit: '-1' } })).rejects.toThrow();
  });
  it('derives outstanding from non-void allocations rather than stored paid status', async () => {
    const existing = await DebtsService.createDebt(customerId, debt('100'), actor());
    const payment = await db.payment.create({ data: { customerId, totalAmount: '40', baseAmount: '40', paymentDate: new Date(today), paymentMethod: 'CASH', createdById: userId } });
    await db.paymentAllocation.create({ data: { paymentId: payment.id, debtId: existing.id, amount: '40', paymentAmount: '40' } });
    await db.customer.update({ where: { id: customerId }, data: { creditLimit: '100' } });
    expect(await outstanding()).toBe('60.00');
    await DebtsService.createDebt(customerId, debt('40'), actor());
    expect(await outstanding()).toBe('100.00');
    await db.payment.update({ where: { id: payment.id }, data: { voidedAt: new Date(), voidedById: userId, voidReason: 'Void test' } });
    await expect(DebtsService.createDebt(customerId, debt('1'), actor())).rejects.toMatchObject({ details: { currentOutstanding: '140.00', projectedOutstanding: '141.00' } });
  });
  it('excludes cancelled debt and includes outstanding installment schedules', async () => {
    await db.debt.create({ data: { customerId, originalAmount: '500', baseOriginalAmount: '500', description: 'Cancelled', dueDate: new Date(today), status: 'CANCELLED', cancelledAt: new Date(), cancelledById: userId, createdById: userId } });
    await db.installmentPlan.create({ data: { customerId, description: 'Existing plan', totalAmount: '30', baseTotalAmount: '30', installmentCount: 2, startDate: new Date(today), createdById: userId, installments: { create: [1, 2].map((n) => ({ installmentNumber: n, dueDate: new Date(today), amountDue: '15', baseAmountDue: '15' })) } } });
    await db.customer.update({ where: { id: customerId }, data: { creditLimit: '40' } });
    await DebtsService.createDebt(customerId, debt('10'), actor());
    expect(await outstanding()).toBe('40.00');
    await expect(DebtsService.createDebt(customerId, debt('1'), actor())).rejects.toMatchObject({ code: 'CREDIT_LIMIT_EXCEEDED' });
  });
  it.each([Currency.USD, Currency.LBP])('uses original %s base snapshots and only the unpaid sale remainder', async (currency) => {
    await db.customer.update({ where: { id: customerId }, data: { creditLimit: '75' } });
    const input = currency === Currency.USD ? sale() : sale({ currency, exchangeRate: '89500.000000', paidAmount: '2237500', items: [{ manualProductName: 'Credit appliance', quantity: 1, unitPrice: '8950000', taxProfileId, priceIncludesVat: true }] });
    const order = await SalesOrdersService.create(input, actor(), {});
    expect(order.debtId).toBeTruthy(); expect(await outstanding()).toBe('75.00');
    expect(await db.payment.count({ where: { salesOrderId: order.id } })).toBe(1);
    await expect(DebtsService.createDebt(customerId, debt('1'), actor())).rejects.toMatchObject({ code: 'CREDIT_LIMIT_EXCEEDED' });
  });
  it('rolls back an over-limit sale, debt, payment and audit together', async () => {
    await db.customer.update({ where: { id: customerId }, data: { creditLimit: '74' } });
    await expect(SalesOrdersService.create(sale(), actor(), {})).rejects.toMatchObject({ code: 'CREDIT_LIMIT_EXCEEDED', details: { currentOutstanding: '0.00', overage: '1.00' } });
    for (const count of [await db.salesOrder.count({ where: { createdById: userId } }), await db.debt.count({ where: { createdById: userId } }), await db.payment.count({ where: { createdById: userId } }), await db.salesAudit.count({ where: { changedById: userId } })]) expect(count).toBe(0);
  });
  it('requires real ADMIN password/reason and audits one successful sale override across retries', async () => {
    await db.customer.update({ where: { id: customerId }, data: { creditLimit: '50' } });
    const input = sale({ overrideCreditLimit: true, creditLimitOverrideReason: 'Owner approved appliance credit', accountPassword: password });
    await expect(SalesOrdersService.create({ ...input, accountPassword: 'wrong' }, actor(), {})).rejects.toMatchObject({ statusCode: 401 });
    const order = await SalesOrdersService.create(input, actor(), {});
    expect((await SalesOrdersService.create(input, actor(), {})).id).toBe(order.id);
    const logs = await db.activityLog.findMany({ where: { userId, action: 'CREDIT_LIMIT_OVERRIDE' } });
    expect(logs).toHaveLength(1);
    expect(logs[0].details).toMatchObject({ customerId, debtId: order.debtId, creditLimit: '50.00', projectedOutstanding: '75.00', overage: '25.00', reason: input.creditLimitOverrideReason });
    expect(JSON.stringify(logs)).not.toContain(password);
    expect(await outstanding()).toBe('75.00');
  });
  it('checks explicit draft sales-to-debt conversion without double-adding existing cash', async () => {
    const order = await SalesOrdersService.create(sale({ fulfillmentStatus: 'DRAFT', debtDueDate: null }), actor(), {});
    await db.customer.update({ where: { id: customerId }, data: { creditLimit: '50' } });
    await expect(SalesOrdersService.createDebt(order.id, { dueDate: today }, actor(), {})).rejects.toMatchObject({ code: 'CREDIT_LIMIT_EXCEEDED' });
    expect((await db.salesOrder.findUniqueOrThrow({ where: { id: order.id } })).debtId).toBeNull();
    await SalesOrdersService.createDebt(order.id, { dueDate: today, overrideCreditLimit: true, creditLimitOverrideReason: 'Approved credit exception', accountPassword: password }, actor(), {});
    expect(await outstanding()).toBe('75.00');
    expect(await db.payment.count({ where: { salesOrderId: order.id } })).toBe(1);
  });
  it('serializes concurrent debts so two individually-valid requests cannot jointly bypass the limit', async () => {
    await db.customer.update({ where: { id: customerId }, data: { creditLimit: '100' } });
    const outcomes = await Promise.allSettled([DebtsService.createDebt(customerId, debt('60'), actor()), DebtsService.createDebt(customerId, debt('60'), actor())]);
    expect(outcomes.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.find((r) => r.status === 'rejected')).toMatchObject({ reason: { code: 'CREDIT_LIMIT_EXCEEDED' } });
    expect(await outstanding()).toBe('60.00');
  });
  it('rolls back a debt when the override audit cannot be recorded', async () => {
    await db.customer.update({ where: { id: customerId }, data: { creditLimit: '0' } });
    vi.spyOn(CreditLimitService, 'audit').mockRejectedValueOnce(new Error('audit failure'));
    await expect(DebtsService.createDebt(customerId, debt('1', { overrideCreditLimit: true, creditLimitOverrideReason: 'Approved exception', accountPassword: password }), actor())).rejects.toThrow('audit failure');
    expect(await db.debt.count({ where: { createdById: userId } })).toBe(0);
    expect(await db.activityLog.count({ where: { userId } })).toBe(0);
  });
});
