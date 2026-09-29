import bcrypt from 'bcrypt';
import {
  PrismaClient,
  Currency,
  SalesAuditAction,
  SalesOrderFulfillmentStatus,
  SalesReturnRefundMethod,
  SalesReturnStockDisposition,
  StockMovementType,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { Decimal } from '@prisma/client/runtime/library';
import { afterEach, describe, expect, it } from 'vitest';
import { businessDateToPrisma, todayInBusinessTimezone } from '../../financial/domain/business-date';
import { SalesReturnsService } from './sales-returns.service';
import { ReportRowsService } from '../../reports/rows/report-rows.service';
import { MonthlyDebtsService } from '../../reports/monthly-debts/monthly-debts.service';
import { DashboardFinancialService } from '../../dashboard/dashboard-financial.service';
import { FinancialLedgerService } from '../../financial/ledger/financial-ledger.service';
import { financialLedgerQuerySchema } from '../../financial/ledger/financial-ledger.validator';
import { DebtsService } from '../../financial/debts/debts.service';
import { PaymentsService } from '../../financial/payments/payments.service';
import { CustomerStatementService } from '../../financial/customer-statement/customer-statement.service';

const runDatabaseTests = process.env.RUN_SALES_RETURN_DB_TESTS === '1' && Boolean(process.env.DATABASE_URL);
const describeDatabase = runDatabaseTests ? describe : describe.skip;
const prisma = new PrismaClient();
const fixtures: Fixture[] = [];

interface Fixture {
  userId: string;
  customerId: string;
  productId: string;
  orderId: string;
  itemId: string;
  debtId: string;
  fulfillmentId: string;
}

describeDatabase('atomic sales return database integration', () => {
  afterEach(async () => {
    for (const fixture of fixtures.splice(0)) await cleanup(fixture);
  });

  it('fully returns stock and money exactly once, keeps payments, audits clearly, and reconciles inventory', async () => {
    const fixture = await createFixture();
    const today = todayInBusinessTimezone();
    const reportQuery = { period: 'custom' as const, from: today, to: today };
    expect((await ReportRowsService.get('customers-financial-integrity', reportQuery)).data.summary).toMatchObject({ mismatches: 0 });
    const input = {
      idempotencyKey: `return-full-${randomUUID()}`,
      items: [{ salesOrderItemId: fixture.itemId, quantity: 2, stockDisposition: SalesReturnStockDisposition.SELLABLE, conditionNote: 'Unopened' }],
      returnDeliveryFee: false,
      refundMethod: SalesReturnRefundMethod.CASH_OUT,
      reason: 'Customer returned unopened appliance',
      overrideReturnWindow: false,
      windowOverrideReason: null,
      accountPassword: 'correct-password',
    };

    const first = await SalesReturnsService.create(fixture.orderId, input, { userId: fixture.userId, role: 'ADMIN' });
    const replay = await SalesReturnsService.create(fixture.orderId, input, { userId: fixture.userId, role: 'ADMIN' });

    expect(replay.id).toBe(first.id);
    expect(first.salesOrder.orderDate).toBe(today);
    expect(first.receivableReliefAmount).toBe('50.00');
    expect(first.refundableAmount).toBe('50.00');
    expect(first.cashRefund?.amount).toBe('50.00');
    expect(await prisma.salesReturn.count({ where: { salesOrderId: fixture.orderId } })).toBe(1);
    expect(await prisma.salesReturnReceivableAllocation.count({ where: { debtId: fixture.debtId } })).toBe(1);
    expect(await prisma.stockMovement.count({ where: { referenceType: 'SALES_RETURN_ITEM' } })).toBe(1);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: fixture.productId } })).stockQuantity).toBe(10);
    expect((await prisma.salesOrder.findUniqueOrThrow({ where: { id: fixture.orderId } })).fulfillmentStatus).toBe(SalesOrderFulfillmentStatus.RETURNED);
    expect((await prisma.debt.findUniqueOrThrow({ where: { id: fixture.debtId } })).status).toBe('PAID');
    // A return offsets the original sale; it must not weaken or imitate the
    // legacy cancellation/reversal contract on that original fulfillment.
    expect((await prisma.salesOrderStockFulfillment.findUniqueOrThrow({ where: { id: fixture.fulfillmentId } })).status).toBe('ACTIVE');
    expect(await prisma.payment.count({ where: { customerId: fixture.customerId, voidedAt: { not: null } } })).toBe(0);

    const audit = await prisma.salesAudit.findMany({ where: { salesOrderId: fixture.orderId, action: SalesAuditAction.RETURN } });
    expect(audit).toHaveLength(1);
    expect(JSON.stringify(audit[0].afterValues)).toContain(first.returnNumber);
    expect(JSON.stringify(audit[0].afterValues)).toContain('SELLABLE');

    const reconciliation = await prisma.$queryRaw<Array<{ cached: number; movement: bigint }>>`
      SELECT p."stockQuantity" AS cached, COALESCE(SUM(sm."quantityChange"), 0)::bigint AS movement
      FROM "products" p
      LEFT JOIN "stock_movements" sm ON sm."productId" = p."id"
      WHERE p."id" = ${fixture.productId}::uuid
      GROUP BY p."id"
    `;
    expect(BigInt(reconciliation[0].cached)).toBe(reconciliation[0].movement);
    const financial = await ReportRowsService.get('customers-financial-integrity', reportQuery);
    expect(financial.data.summary).toMatchObject({ mismatches: 0 });
    expect(financial.data.rows.find((row: any) => row.customer.id === fixture.customerId)).toMatchObject({
      reportedOutstanding: '0.00', independentOutstanding: '0.00', difference: '0.00',
    });
    expect((await ReportRowsService.get('inventory-reconciliation', reportQuery)).data.summary).toMatchObject({ mismatches: 0 });
    expect((await ReportRowsService.get('suppliers-financial-integrity', reportQuery)).data.summary).toMatchObject({ mismatches: 0 });
    const monthly = await MonthlyDebtsService.getDebtReportForRange({ month: today.slice(0, 7), mode: 'SNAPSHOT', includeZero: true, includeCancelled: false, overdueOnly: false, page: 1, limit: 10000, sortBy: 'OUTSTANDING', sortOrder: 'DESC' }, today, today);
    expect(monthly.rows.find((row) => row.customer.id === fixture.customerId)?.totalOutstanding ?? '0.00').toBe('0.00');
    expect((await CustomerStatementService.get(fixture.customerId, { from: today, to: today })).closingBalance).toBe('0.00');
    expect((await DashboardFinancialService.getFinancialSummary()).money.totalOutstanding).toBe('0.00');
    const ledger = await FinancialLedgerService.getFinancialLedger(financialLedgerQuerySchema.parse({ customerId: fixture.customerId }));
    expect(ledger.summary.totalOutstanding).toBe('0.00');
    expect((await ReportRowsService.get('sales-unpaid', reportQuery)).data.rows).toHaveLength(0);
    expect((await ReportRowsService.get('customers-aging', reportQuery)).data.rows).toHaveLength(0);
    expect((await ReportRowsService.get('sales-orders', reportQuery)).data.summary).toMatchObject({ totalAmount: '100.00', returnsAmount: '100.00', netSalesAmount: '0.00', cashRefunds: '50.00', storeCreditIssued: '0.00' });
    const movement = await ReportRowsService.get('customers-not-paid', reportQuery);
    expect(movement.data.rows.find((row: any) => row.customer.id === fixture.customerId)).toMatchObject({ newDebt: '50.00', returnCredits: '50.00', closingBalance: '0.00' });
    const activity = await MonthlyDebtsService.getMonthlyFinancialActivity({ month: today.slice(0, 7), customerId: fixture.customerId, page: 1, limit: 100 });
    expect(activity.summary).toMatchObject({ returnCredits: '50.00', cashRefunds: '50.00', paymentsReceived: '0.00', netFinancialChange: '0.00' });
    expect(activity.items.find((item) => item.type === 'SALES_RETURN')).toMatchObject({ amount: '-50.00', cashRefundAmount: '50.00' });
    await expect(DebtsService.recordDebtPayment(fixture.debtId, { amount: '1.00', paymentDate: today }, { userId: fixture.userId, role: 'ADMIN' })).rejects.toThrow();
    await expect(DebtsService.cancelDebt(fixture.debtId, { reason: 'Unsafe correction', accountPassword: 'correct-password' }, { userId: fixture.userId, role: 'ADMIN' })).rejects.toThrow('credited by a sales return');

    await expect(SalesReturnsService.create(fixture.orderId, {
      ...input,
      idempotencyKey: `return-again-${randomUUID()}`,
    }, { userId: fixture.userId, role: 'ADMIN' })).rejects.toThrow('Only delivered or partially returned orders can be returned');
  }, 30_000);

  it('retains the database constraint requiring a real movement for a cancelled fulfillment', async () => {
    const fixture = await createFixture();
    await expect(prisma.salesOrderStockFulfillment.update({ where: { id: fixture.fulfillmentId }, data: { status: 'REVERSED', reversedAt: new Date(), reversedById: fixture.userId, reversalReason: 'Missing movement' } })).rejects.toThrow();
    expect((await prisma.salesOrderStockFulfillment.findUniqueOrThrow({ where: { id: fixture.fulfillmentId } })).status).toBe('ACTIVE');
  });

  it('prints a later payment after a partial return with the credited balance and blocks independent void', async () => {
    const fixture = await createFixture();
    const actor = { userId: fixture.userId, role: 'ADMIN' };
    const today = todayInBusinessTimezone();
    await prisma.debt.update({ where: { id: fixture.debtId }, data: { originalAmount: '100.00', baseOriginalAmount: '100.00' } });
    await prisma.salesOrder.update({ where: { id: fixture.orderId }, data: { paidAmount: '0.00', basePaidAmount: '0.00', remainingAmount: '100.00', baseRemainingAmount: '100.00', paymentStatus: 'UNPAID' } });
    await SalesReturnsService.create(fixture.orderId, { idempotencyKey: randomUUID(), items: [{ salesOrderItemId: fixture.itemId, quantity: 1, stockDisposition: SalesReturnStockDisposition.SELLABLE }], returnDeliveryFee: false, refundMethod: SalesReturnRefundMethod.NONE, reason: 'Partial return before payment', overrideReturnWindow: false, windowOverrideReason: null, accountPassword: 'correct-password' }, actor);
    await DebtsService.recordDebtPayment(fixture.debtId, { amount: '10.00', paymentDate: today }, actor);
    const payment = await prisma.payment.findFirstOrThrow({ where: { customerId: fixture.customerId } });
    expect((await PaymentsService.getReceipt(payment.id)).remainingBalances[0].amount).toBe('40.00');
    await expect(DebtsService.recordDebtPayment(fixture.debtId, { amount: '41.00', paymentDate: today }, actor)).rejects.toThrow();
    await expect(PaymentsService.voidPayment(payment.id, { reason: 'Unsafe independent reversal', accountPassword: 'correct-password', sourceScreen: 'API' }, actor)).rejects.toThrow('cannot be corrected independently');
    expect((await ReportRowsService.get('customers-financial-integrity', { period: 'thisMonth' })).data.summary).toMatchObject({ mismatches: 0, reportedTotal: '40.00' });
  }, 30_000);

  it('posts a partial condition return without adding damaged goods to sellable stock', async () => {
    const fixture = await createFixture();
    const result = await SalesReturnsService.create(fixture.orderId, {
      idempotencyKey: `return-partial-${randomUUID()}`,
      items: [{ salesOrderItemId: fixture.itemId, quantity: 1, stockDisposition: SalesReturnStockDisposition.DAMAGED, conditionNote: 'Compressor damaged' }],
      returnDeliveryFee: false,
      refundMethod: SalesReturnRefundMethod.NONE,
      reason: 'Accepted damaged partial return',
      overrideReturnWindow: false,
      windowOverrideReason: null,
      accountPassword: 'correct-password',
    }, { userId: fixture.userId, role: 'ADMIN' });

    expect(result.totalIncVat).toBe('50.00');
    expect(result.receivableReliefAmount).toBe('50.00');
    expect(result.refundableAmount).toBe('0.00');
    expect((await prisma.product.findUniqueOrThrow({ where: { id: fixture.productId } })).stockQuantity).toBe(8);
    expect((await prisma.salesOrder.findUniqueOrThrow({ where: { id: fixture.orderId } })).fulfillmentStatus).toBe(SalesOrderFulfillmentStatus.PARTIALLY_RETURNED);
    expect((await prisma.salesOrderStockFulfillment.findUniqueOrThrow({ where: { id: fixture.fulfillmentId } })).status).toBe('ACTIVE');
    expect(await prisma.stockMovement.count({ where: { movementType: StockMovementType.SALE_RETURN_SELLABLE, productId: fixture.productId } })).toBe(0);
  }, 30_000);

  it('posts and reprints both $50 VAT-inclusive partial returns using original 11% snapshots', async () => {
    const fixture = await createFixture();
    await prisma.salesOrderItem.update({ where: { id: fixture.itemId }, data: {
      lineTotal: '90.09', baseLineTotal: '90.09', unitPriceExVat: '45.05',
      taxRateSnapshot: '11.000', taxCodeSnapshot: 'ORIGINAL_STANDARD', vatAmount: '9.91', lineTotalIncVat: '100.00',
    } });
    await prisma.salesOrder.update({ where: { id: fixture.orderId }, data: { itemsSubtotal: '90.09', baseSubtotal: '90.09' } });
    const results = [];
    for (const [index, method] of [SalesReturnRefundMethod.NONE, SalesReturnRefundMethod.CASH_OUT].entries()) {
      results.push(await SalesReturnsService.create(fixture.orderId, {
        idempotencyKey: `return-vat-${randomUUID()}`,
        items: [{ salesOrderItemId: fixture.itemId, quantity: 1, stockDisposition: SalesReturnStockDisposition.SELLABLE, conditionNote: null }],
        returnDeliveryFee: false, refundMethod: method, reason: `Original VAT snapshot return ${index}`,
        overrideReturnWindow: false, windowOverrideReason: null, accountPassword: 'correct-password',
      }, { userId: fixture.userId, role: 'ADMIN' }));
    }
    expect(results.map((result) => result.subtotalExVat)).toEqual(['45.04', '45.05']);
    expect(results.map((result) => result.vatAmount)).toEqual(['4.96', '4.95']);
    expect(results.map((result) => result.totalIncVat)).toEqual(['50.00', '50.00']);
    for (const result of results) {
      const reprint = await SalesReturnsService.get(result.id);
      expect(reprint).toEqual(result);
      expect(reprint.items[0].taxRateSnapshot).toBe('11.000');
    }
    const sums = await prisma.salesReturnItem.aggregate({ where: { salesOrderItemId: fixture.itemId }, _sum: {
      subtotalExVat: true, vatAmount: true, totalIncVat: true, baseSubtotalExVat: true, baseVatAmount: true, baseTotalIncVat: true,
    } });
    expect(sums._sum.subtotalExVat?.toFixed(2)).toBe('90.09');
    expect(sums._sum.vatAmount?.toFixed(2)).toBe('9.91');
    expect(sums._sum.totalIncVat?.toFixed(2)).toBe('100.00');
    expect(sums._sum.baseSubtotalExVat?.toFixed(2)).toBe('90.09');
    expect(sums._sum.baseVatAmount?.toFixed(2)).toBe('9.91');
    expect(sums._sum.baseTotalIncVat?.toFixed(2)).toBe('100.00');
  }, 30_000);

  it.each([[1, 1, 1], [2, 1], [1, 2]])('reverses LBP and base snapshots exactly across quantity sequence %j', async (...quantities) => {
    const fixture = await createFixture();
    await prisma.product.update({ where: { id: fixture.productId }, data: { stockQuantity: 7 } });
    await prisma.stockMovement.updateMany({ where: { productId: fixture.productId, movementType: StockMovementType.SALE_FULFILLMENT }, data: { quantityChange: -3, quantityAfter: 7 } });
    await prisma.salesOrderStockFulfillment.update({ where: { id: fixture.fulfillmentId }, data: { quantity: 3 } });
    await prisma.salesOrder.update({ where: { id: fixture.orderId }, data: {
      currency: Currency.LBP, exchangeRate: '89500.000000', debtId: null, settlement: 'NONE', paymentStatus: 'PAID',
      itemsSubtotal: '89500', totalAmount: '99345', paidAmount: '99345', remainingAmount: '0',
      baseSubtotal: '1.00', baseTotalAmount: '1.11', basePaidAmount: '1.11', baseRemainingAmount: '0.00',
    } });
    await prisma.salesOrderItem.update({ where: { id: fixture.itemId }, data: {
      quantity: 3, unitPrice: '33115', lineTotal: '89500', unitPriceExVat: '29833', vatAmount: '9845', lineTotalIncVat: '99345',
      baseUnitPrice: '0.37', baseLineTotal: '1.00', taxRateSnapshot: '11.000', taxCodeSnapshot: 'ORIGINAL_STANDARD',
    } });
    for (const quantity of quantities) {
      const result = await SalesReturnsService.create(fixture.orderId, {
        idempotencyKey: `return-lbp-${randomUUID()}`,
        items: [{ salesOrderItemId: fixture.itemId, quantity, stockDisposition: SalesReturnStockDisposition.SELLABLE, conditionNote: null }],
        returnDeliveryFee: false, refundMethod: SalesReturnRefundMethod.CASH_OUT, reason: 'Original LBP snapshots return',
        overrideReturnWindow: false, windowOverrideReason: null, accountPassword: 'correct-password',
      }, { userId: fixture.userId, role: 'ADMIN' });
      expect(new Decimal(result.subtotalExVat).plus(result.vatAmount).equals(result.totalIncVat)).toBe(true);
      expect(new Decimal(result.baseSubtotalExVat).plus(result.baseVatAmount).equals(result.baseTotalIncVat)).toBe(true);
    }
    const sums = await prisma.salesReturnItem.aggregate({ where: { salesOrderItemId: fixture.itemId }, _sum: {
      quantity: true, subtotalExVat: true, vatAmount: true, totalIncVat: true, baseSubtotalExVat: true, baseVatAmount: true, baseTotalIncVat: true,
    } });
    expect(sums._sum.quantity).toBe(3);
    expect(sums._sum.subtotalExVat?.toFixed(0)).toBe('89500');
    expect(sums._sum.vatAmount?.toFixed(0)).toBe('9845');
    expect(sums._sum.totalIncVat?.toFixed(0)).toBe('99345');
    expect(sums._sum.baseSubtotalExVat?.toFixed(2)).toBe('1.00');
    expect(sums._sum.baseVatAmount?.toFixed(2)).toBe('0.11');
    expect(sums._sum.baseTotalIncVat?.toFixed(2)).toBe('1.11');
    expect((await prisma.product.findUniqueOrThrow({ where: { id: fixture.productId } })).stockQuantity).toBe(10);
  }, 30_000);

  it('rolls back stock, finance, refund, state, and return records when the final audit write fails', async () => {
    const fixture = await createFixture();
    const suffix = fixture.orderId.replaceAll('-', '');
    const functionName = `fail_return_audit_${suffix}`;
    const triggerName = `fail_return_audit_trigger_${suffix}`;
    await prisma.$executeRawUnsafe(`
      CREATE FUNCTION "${functionName}"() RETURNS trigger AS $$
      BEGIN
        IF NEW."recordId" = '${fixture.orderId}'::uuid AND NEW."action" = 'RETURN' THEN
          RAISE EXCEPTION 'injected return audit failure';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER "${triggerName}" BEFORE INSERT ON "sales_audits"
      FOR EACH ROW EXECUTE FUNCTION "${functionName}"();
    `);

    try {
      await expect(SalesReturnsService.create(fixture.orderId, {
        idempotencyKey: `return-rollback-${randomUUID()}`,
        items: [{ salesOrderItemId: fixture.itemId, quantity: 2, stockDisposition: SalesReturnStockDisposition.SELLABLE, conditionNote: null }],
        returnDeliveryFee: false,
        refundMethod: SalesReturnRefundMethod.CASH_OUT,
        reason: 'Rollback integration probe',
        overrideReturnWindow: false,
        windowOverrideReason: null,
        accountPassword: 'correct-password',
      }, { userId: fixture.userId, role: 'ADMIN' })).rejects.toThrow('injected return audit failure');
    } finally {
      await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "${triggerName}" ON "sales_audits"`);
      await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS "${functionName}"()`);
    }

    expect(await prisma.salesReturn.count({ where: { salesOrderId: fixture.orderId } })).toBe(0);
    expect(await prisma.cashRefund.count({ where: { customerId: fixture.customerId } })).toBe(0);
    expect(await prisma.salesReturnReceivableAllocation.count({ where: { debtId: fixture.debtId } })).toBe(0);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: fixture.productId } })).stockQuantity).toBe(8);
    expect((await prisma.salesOrder.findUniqueOrThrow({ where: { id: fixture.orderId } })).fulfillmentStatus).toBe(SalesOrderFulfillmentStatus.DELIVERED);
    expect((await prisma.salesOrderStockFulfillment.findUniqueOrThrow({ where: { id: fixture.fulfillmentId } })).status).toBe('ACTIVE');
  }, 30_000);
});

async function createFixture(): Promise<Fixture> {
  const userId = randomUUID();
  const customerId = randomUUID();
  const productId = randomUUID();
  const orderId = randomUUID();
  const itemId = randomUUID();
  const debtId = randomUUID();
  const openingMovementId = randomUUID();
  const saleMovementId = randomUUID();
  const fulfillmentId = randomUUID();
  const today = businessDateToPrisma(todayInBusinessTimezone());

  await prisma.user.create({ data: { id: userId, username: `return-${userId}`, password: await bcrypt.hash('correct-password', 4), fullName: 'Return Test Admin', role: 'ADMIN' } });
  await prisma.customer.create({ data: { id: customerId, name: 'Return Test Customer', phone: `return-${customerId}`, createdBy: userId } });
  await prisma.product.create({ data: { id: productId, sku: `RET-${productId}`, name: 'Return Test Product', model: 'RET-1', trackStock: true, stockQuantity: 8, createdById: userId } });
  await prisma.stockMovement.createMany({ data: [
    { id: openingMovementId, productId, movementType: StockMovementType.OPENING_BALANCE, quantityChange: 10, quantityBefore: 0, quantityAfter: 10, reason: 'Return fixture opening', createdById: userId },
    { id: saleMovementId, productId, movementType: StockMovementType.SALE_FULFILLMENT, quantityChange: -2, quantityBefore: 10, quantityAfter: 8, reason: 'Return fixture sale', referenceType: 'SALES_ORDER_ITEM', referenceId: itemId, createdById: userId },
  ] });
  await prisma.debt.create({ data: { id: debtId, customerId, description: 'Return fixture receivable', originalAmount: '50.00', baseOriginalAmount: '50.00', dueDate: today, createdById: userId } });
  await prisma.salesOrder.create({ data: {
    id: orderId, orderNumber: `SO-RET-${orderId}`, customerId, salesChannel: 'SHOP_DIRECT', orderDate: today, deliveredAt: today,
    fulfillmentStatus: SalesOrderFulfillmentStatus.DELIVERED, paymentStatus: 'PARTIALLY_PAID', settlement: 'DEBT',
    itemsSubtotal: '100.00', deliveryTaxTreatment: 'STANDARD', deliveryTaxRateSnapshot: '0.000', deliveryVatAmount: '0.00',
    totalAmount: '100.00', paidAmount: '50.00', remainingAmount: '50.00', currency: 'USD', exchangeRate: '1.000000',
    baseSubtotal: '100.00', baseTotalAmount: '100.00', basePaidAmount: '50.00', baseRemainingAmount: '50.00', debtId, createdById: userId,
  } });
  await prisma.salesOrderItem.create({ data: {
    id: itemId, salesOrderId: orderId, productId, productNameSnapshot: 'Return Test Product', productModelSnapshot: 'RET-1', skuSnapshot: `RET-${productId}`,
    quantity: 2, unitPrice: '50.00', discountAmount: '0.00', lineTotal: '100.00', baseUnitPrice: '50.00', baseDiscountAmount: '0.00', baseLineTotal: '100.00',
    taxRateSnapshot: '0.000', taxCodeSnapshot: 'ZERO', unitPriceExVat: '50.00', vatAmount: '0.00', lineTotalIncVat: '100.00',
  } });
  await prisma.salesOrderStockFulfillment.create({ data: { id: fulfillmentId, salesOrderId: orderId, salesOrderItemId: itemId, productId, quantity: 2, stockMovementId: saleMovementId, createdById: userId } });
  await prisma.businessSettings.upsert({ where: { id: 'primary' }, create: { id: 'primary', returnWindowDays: 14 }, update: { returnWindowDays: 14 } });

  const fixture = { userId, customerId, productId, orderId, itemId, debtId, fulfillmentId };
  fixtures.push(fixture);
  return fixture;
}

async function cleanup(fixture: Fixture) {
  const returns = await prisma.salesReturn.findMany({ where: { salesOrderId: fixture.orderId }, select: { id: true } });
  const returnIds = returns.map((item) => item.id);
  await prisma.customerCreditApplication.deleteMany({ where: { salesOrderId: fixture.orderId } });
  await prisma.cashRefund.deleteMany({ where: { salesReturnId: { in: returnIds } } });
  await prisma.customerCredit.deleteMany({ where: { salesReturnId: { in: returnIds } } });
  await prisma.salesReturnReceivableAllocation.deleteMany({ where: { salesReturnId: { in: returnIds } } });
  await prisma.salesReturnItem.deleteMany({ where: { salesReturnId: { in: returnIds } } });
  await prisma.salesAudit.deleteMany({ where: { salesOrderId: fixture.orderId } });
  await prisma.salesReturn.deleteMany({ where: { id: { in: returnIds } } });
  await prisma.salesOrderStockFulfillment.deleteMany({ where: { salesOrderId: fixture.orderId } });
  await prisma.stockMovement.deleteMany({ where: { productId: fixture.productId } });
  await prisma.salesOrderItem.deleteMany({ where: { salesOrderId: fixture.orderId } });
  await prisma.salesOrder.deleteMany({ where: { id: fixture.orderId } });
  await prisma.paymentAllocation.deleteMany({ where: { payment: { createdById: fixture.userId } } });
  await prisma.payment.deleteMany({ where: { createdById: fixture.userId } });
  await prisma.debt.deleteMany({ where: { id: fixture.debtId } });
  await prisma.product.deleteMany({ where: { id: fixture.productId } });
  await prisma.customer.deleteMany({ where: { id: fixture.customerId } });
  await prisma.adminVerificationLog.deleteMany({ where: { userId: fixture.userId } });
  await prisma.user.deleteMany({ where: { id: fixture.userId } });
}
