import { mkdirSync, writeFileSync } from 'node:fs';
import { todayInBusinessTimezone, businessDateToPrisma } from '../financial';
import { addDays } from '../dashboard/shared/dashboard-range';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { app } from '../../app';
import { insertMigrationRow } from '../../test/branch-migration-fixture';
import { isIsolatedTestDatabase } from '../../test/database';

const enabled =
  process.env.RUN_FINANCIAL_DB_TESTS === '1' && isIsolatedTestDatabase(process.env.DATABASE_URL);
const db = new PrismaClient();
const run = randomUUID().replaceAll('-', '');
const a = randomUUID(),
  b = randomUUID(),
  admin = randomUUID(),
  employee = randomUUID();
const password = 'phase3c-synthetic-password';
type Records = Record<string, string>;
const records: Record<'a' | 'b', Records> = { a: {}, b: {} };
let tokens: Record<'admin' | 'employee', string>;
let receiptDir: string;
let product: string;
let createdSettings = false;
const taxProfileId = randomUUID(),
  taxRateId = randomUUID();
const today = todayInBusinessTimezone();
const month = today.slice(0, 7);
const from = addDays(today, -140);
const stamp = businessDateToPrisma(today);
const otherActive: string[] = [];
const dateAgo = (days: number) => businessDateToPrisma(addDays(today, -days));
const tables = [
  'activity_logs',
  'customers',
  'suppliers',
  'sales_orders',
  'sales_order_items',
  'debts',
  'installment_plans',
  'installments',
  'payments',
  'payment_allocations',
  'sales_returns',
  'sales_return_items',
  'sales_return_receivable_allocations',
  'cash_refunds',
  'customer_credits',
  'prepaid_purchases',
  'financial_correction_audits',
  'service_jobs',
  'supplier_transactions',
  'supplier_purchase_lines',
  'supplier_receivings',
  'supplier_receiving_items',
  'supplier_receiving_receipts',
  'stock_movements',
  'admin_verification_logs',
  'sales_audits',
  'supplier_audits',
  'service_audits',
];
const headers = (actor: 'admin' | 'employee' = 'employee', scope?: string) => ({
  Authorization: 'Bearer ' + tokens[actor],
  ...(scope === undefined ? {} : { 'X-Branch-Scope': scope }),
});
function call(
  method: string,
  url: string,
  actor: 'admin' | 'employee' = 'employee',
  scope?: string,
  body: object = {}
) {
  const agent = request(app);
  const req =
    method === 'GET'
      ? agent.get(url)
      : method === 'PATCH'
        ? agent.patch(url)
        : method === 'DELETE'
          ? agent.delete(url)
          : agent.post(url);
  return req.set(headers(actor, scope)).send(body);
}
async function state() {
  // All test files run serially; include children, audit rows and stock as well as roots.
  const result: Record<string, unknown> = {};
  for (const table of tables)
    result[table] = await db.$queryRawUnsafe(
      `SELECT to_jsonb(t) AS row FROM "${table}" t ORDER BY id`
    );
  return result;
}

// Real grants and real Prisma reads; global product/stock evidence is shared.
describe.runIf(enabled)('Phase 3C reports and dashboards branch isolation', () => {
  beforeAll(async () => {
    const name = decodeURIComponent(new URL(process.env.DATABASE_URL!).pathname.slice(1));
    if (name === 'homeconnect' || name !== 'homeconnect_test_phase4_phase5_phase6')
      throw Error('Unsafe Phase 3C target');
    console.log('Confirmed Phase 3C database: ' + name);
    vi.stubEnv('MULTI_BRANCH_SCOPING_ENABLED', 'true');
    receiptDir = await mkdtemp(path.join(tmpdir(), 'homeconnect-phase3c-'));
    vi.stubEnv('RECEIPTS_DIR', receiptDir);
    if (!(await db.businessSettings.findUnique({ where: { id: 'primary' } }))) {
      await db.businessSettings.create({ data: { id: 'primary' } });
      createdSettings = true;
    }
    otherActive.push(
      ...(await db.branch.findMany({ where: { isActive: true }, select: { id: true } })).map(
        (row) => row.id
      )
    );
    await db.branch.updateMany({ where: { id: { in: otherActive } }, data: { isActive: false } });
    const hash = await bcrypt.hash(password, 4);
    await db.user.createMany({
      data: [
        {
          id: admin,
          username: '3c-admin-' + run,
          fullName: '3C admin',
          role: 'ADMIN',
          password: hash,
        },
        {
          id: employee,
          username: '3c-employee-' + run,
          fullName: '3C employee',
          role: 'EMPLOYEE',
          password: hash,
        },
      ],
    });
    await db.taxRate.create({
      data: {
        id: taxRateId,
        code: '3C_RATE_' + run,
        name: '3C zero rate',
        nameAr: '3C',
        ratePercent: '0',
        effectiveFrom: stamp,
        createdById: admin,
      },
    });
    await db.taxProfile.create({
      data: {
        id: taxProfileId,
        code: '3C_PROFILE_' + run,
        name: '3C test profile',
        nameAr: '3C',
        taxRateId,
      },
    });
    await db.branch.createMany({
      data: [
        { id: a, code: '3CA' + run.slice(0, 8), name: '3C A ' + run, createdById: admin },
        { id: b, code: '3CB' + run.slice(0, 8), name: '3C B ' + run, createdById: admin },
      ],
    });
    // Deliberately no branchFixture/automatic employee grants, and no scope mocks.
    await db.userBranchAccess.create({
      data: { userId: employee, branchId: a, grantedById: admin },
    });
    tokens = Object.fromEntries(
      (['admin', 'employee'] as const).map((actor) => [
        actor,
        jwt.sign(
          {
            userId: actor === 'admin' ? admin : employee,
            role: actor === 'admin' ? 'ADMIN' : 'EMPLOYEE',
            branchIds: [b],
          },
          process.env.JWT_SECRET!,
          { expiresIn: '1h' }
        ),
      ])
    ) as typeof tokens;
    await db.$transaction(
      async (tx) => {
        product = await insertMigrationRow(tx, 'products', {
          createdById: admin,
          trackStock: true,
          stockQuantity: 0,
        });
        await insertMigrationRow(tx, 'stock_movements', {
          productId: product,
          createdById: admin,
          movementType: 'OPENING_BALANCE',
          quantityChange: 0,
          quantityBefore: 0,
          quantityAfter: 0,
          createdAt: stamp,
        });
        for (const [side, branchId] of [
          ['a', a],
          ['b', b],
        ] as const) {
          const r = records[side];
          const add = async (key: string, table: string, values: Record<string, unknown>) =>
            (r[key] = await insertMigrationRow(tx, table, values));
          await add('customer', 'customers', {
            branchId,
            createdBy: admin,
            name: '3C customer ' + run,
            phone: '3c-' + run + side,
          });
          await add('supplier', 'suppliers', {
            branchId,
            createdById: admin,
            name: '3C supplier ' + run,
          });
          await add('debt', 'debts', {
            branchId,
            customerId: r.customer,
            createdById: admin,
            originalAmount: '100',
            baseOriginalAmount: '100',
            dueDate: stamp,
          });
          await add('plan', 'installment_plans', {
            branchId,
            customerId: r.customer,
            createdById: admin,
            totalAmount: '100',
            baseTotalAmount: '100',
            startDate: stamp,
          });
          await add('installment', 'installments', {
            installmentPlanId: r.plan,
            amountDue: '100',
            baseAmountDue: '100',
            dueDate: stamp,
          });
          await add('order', 'sales_orders', {
            branchId,
            customerId: r.customer,
            createdById: admin,
            orderDate: stamp,
            fulfillmentStatus: 'DELIVERED',
            totalAmount: '100',
            baseTotalAmount: '100',
            paidAmount: '0',
            basePaidAmount: '0',
            remainingAmount: '100',
            baseRemainingAmount: '100',
          });
          await add('item', 'sales_order_items', {
            salesOrderId: r.order,
            manualProductName: '3C manual line',
            quantity: 1,
            taxRateSnapshot: '0',
            vatAmount: '0',
          });
          await add('walkin', 'sales_orders', {
            branchId,
            createdById: admin,
            orderDate: stamp,
            fulfillmentStatus: 'CONFIRMED',
          });
          await add('payment', 'payments', {
            branchId,
            customerId: r.customer,
            createdById: admin,
            totalAmount: '10',
            baseAmount: '10',
            paymentDate: stamp,
          });
          await add('allocation', 'payment_allocations', {
            paymentId: r.payment,
            installmentId: r.installment,
            amount: '10',
            paymentAmount: '10',
          });
          await add('counter', 'payments', {
            sourceSnapshot: JSON.stringify({ version: 1, orderNumber: '3C counter', items: [] }),
            branchId,
            salesOrderId: r.walkin,
            createdById: admin,
            totalAmount: '10',
            baseAmount: '10',
            paymentDate: stamp,
          });
          for (const [key, method, sequence] of [
            ['return', 'CASH_OUT', 1],
            ['creditReturn', 'STORE_CREDIT', 2],
          ] as const) {
            await add(key, 'sales_returns', {
              branchId,
              salesOrderId: r.order,
              customerId: r.customer,
              processedById: admin,
              sequence,
              refundMethod: method,
              returnDate: stamp,
              returnDeadlineSnapshot: stamp,
              totalIncVat: '10',
              baseTotalIncVat: '10',
              receivableReliefAmount: '0',
              baseReceivableReliefAmount: '0',
              refundableAmount: '10',
              baseRefundableAmount: '10',
            });
          }
          await add('refund', 'cash_refunds', {
            branchId,
            salesReturnId: r.return,
            customerId: r.customer,
            processedById: admin,
          });
          await add('credit', 'customer_credits', {
            branchId,
            salesReturnId: r.creditReturn,
            customerId: r.customer,
            issuedById: admin,
          });
          await add('prepaidDebt', 'debts', {
            branchId,
            customerId: r.customer,
            createdById: admin,
            kind: 'PREPAID_PURCHASE',
            originalAmount: '100',
            baseOriginalAmount: '100',
            dueDate: stamp,
          });
          await add('prepaid', 'prepaid_purchases', { debtId: r.prepaidDebt });
          await add('correction', 'financial_correction_audits', {
            recordType: 'DEBT',
            recordId: r.debt,
            customerId: r.customer,
            correctedById: admin,
          });
          await add('counterCorrection', 'financial_correction_audits', {
            recordType: 'PAYMENT',
            recordId: r.counter,
            correctedById: admin,
          });
          await add('billingCorrection', 'financial_correction_audits', {
            recordType: 'CUSTOMER_BILLING',
            recordId: r.customer,
            customerId: r.customer,
            correctedById: admin,
          });
          await add('job', 'service_jobs', {
            branchId,
            customerId: r.customer,
            createdById: admin,
            serviceCreatedDate: stamp,
          });
          await add('receiving', 'supplier_receivings', {
            branchId,
            supplierId: r.supplier,
            receivedById: admin,
          });
          await add('anonymousReceiving', 'supplier_receivings', { branchId, receivedById: admin });
          await add('transaction', 'supplier_transactions', {
            branchId,
            supplierId: r.supplier,
            createdById: admin,
            type: 'SUPPLIER_PAYMENT',
            direction: 'DECREASE_OWED',
            amount: '10',
            baseAmount: '10',
            transactionDate: stamp,
          });
          await add('purchase', 'supplier_transactions', {
            branchId,
            supplierId: r.supplier,
            supplierReceivingId: r.receiving,
            createdById: admin,
            type: 'SUPPLIER_DEBT',
            direction: 'INCREASE_OWED',
            amount: '10',
            baseAmount: '10',
            transactionDate: stamp,
            receiptNumber: '3C-' + run,
          });
          await add('purchaseLine', 'supplier_purchase_lines', {
            supplierTransactionId: r.purchase,
            kind: 'MANUAL',
            description: '3C line',
            lineTotal: '10',
            baseLineTotal: '10',
            taxRateSnapshot: '0',
            unitPriceExVat: '10',
            vatAmount: '0',
            lineTotalIncVat: '10',
            position: 0,
          });
          await add('salesAudit', 'sales_audits', {
            recordType: 'SALES_ORDER',
            recordId: r.order,
            salesOrderId: r.order,
            changedById: admin,
          });
          await add('serviceAudit', 'service_audits', {
            recordType: 'SERVICE_JOB',
            recordId: r.job,
            serviceJobId: r.job,
            changedById: admin,
          });

          const scale = side === 'a' ? 1 : 2;
          const original = (base: number) => String(base * scale * 90000);
          const base = (value: number) => String(value * scale);
          for (const [index, days] of [0, 15, 45, 75, 110].entries()) {
            await add('aging' + index, 'debts', {
              branchId,
              customerId: r.customer,
              createdById: admin,
              kind: 'STANDARD',
              originalAmount: base(11 + index),
              baseOriginalAmount: base(11 + index),
              dueDate: dateAgo(days),
              createdAt: dateAgo(days),
            });
          }
          await add('lbpDebt', 'debts', {
            branchId,
            customerId: r.customer,
            createdById: admin,
            currency: 'LBP',
            exchangeRate: '90000',
            originalAmount: original(100),
            baseOriginalAmount: base(100),
            dueDate: dateAgo(15),
            createdAt: dateAgo(15),
          });
          await add('lbpPlan', 'installment_plans', {
            branchId,
            customerId: r.customer,
            createdById: admin,
            currency: 'LBP',
            exchangeRate: '90000',
            totalAmount: original(100),
            baseTotalAmount: base(100),
            startDate: dateAgo(45),
            createdAt: dateAgo(45),
          });
          await add('lbpInstallment', 'installments', {
            installmentPlanId: r.lbpPlan,
            amountDue: original(100),
            baseAmountDue: base(100),
            dueDate: dateAgo(45),
          });
          await add('lbpPayment', 'payments', {
            branchId,
            customerId: r.customer,
            createdById: admin,
            currency: 'LBP',
            exchangeRate: '90000',
            totalAmount: original(20),
            baseAmount: base(20),
            paymentDate: stamp,
          });
          await add('lbpDebtAllocation', 'payment_allocations', {
            paymentId: r.lbpPayment,
            debtId: r.lbpDebt,
            amount: original(10),
            paymentAmount: original(10),
            exchangeRate: '1',
          });
          await add('lbpPlanAllocation', 'payment_allocations', {
            paymentId: r.lbpPayment,
            installmentId: r.lbpInstallment,
            amount: original(10),
            paymentAmount: original(10),
            exchangeRate: '1',
          });
          await add('lbpSupplierDebt', 'supplier_transactions', {
            branchId,
            supplierId: r.supplier,
            createdById: admin,
            type: 'SUPPLIER_DEBT',
            direction: 'INCREASE_OWED',
            currency: 'LBP',
            exchangeRate: '90000',
            amount: original(100),
            baseAmount: base(100),
            transactionDate: dateAgo(45),
            dueDate: dateAgo(30),
          });
          await add('lbpSupplierPayment', 'supplier_transactions', {
            branchId,
            supplierId: r.supplier,
            createdById: admin,
            type: 'SUPPLIER_PAYMENT',
            direction: 'DECREASE_OWED',
            currency: 'LBP',
            exchangeRate: '90000',
            amount: original(20),
            baseAmount: base(20),
            transactionDate: stamp,
          });
          await add('lbpSale', 'sales_orders', {
            branchId,
            customerId: r.customer,
            createdById: admin,
            currency: 'LBP',
            exchangeRate: '90000',
            orderDate: stamp,
            fulfillmentStatus: 'DELIVERED',
            paymentStatus: 'PAID',
            totalAmount: original(100),
            baseTotalAmount: base(100),
            paidAmount: original(100),
            basePaidAmount: base(100),
            remainingAmount: '0',
            baseRemainingAmount: '0',
          });
          for (const [key, method, sequence] of [
            ['lbpCreditReturn', 'STORE_CREDIT', 1],
            ['lbpCashReturn', 'CASH_OUT', 2],
          ] as const) {
            const relief = method === 'STORE_CREDIT' ? 10 : 0;
            await add(key, 'sales_returns', {
              branchId,
              salesOrderId: r.lbpSale,
              customerId: r.customer,
              processedById: admin,
              currency: 'LBP',
              exchangeRate: '90000',
              sequence,
              refundMethod: method,
              returnDate: stamp,
              returnDeadlineSnapshot: stamp,
              subtotalExVat: original(20),
              vatAmount: '0',
              totalIncVat: original(20),
              baseSubtotalExVat: base(20),
              baseVatAmount: '0',
              baseTotalIncVat: base(20),
              receivableReliefAmount: original(relief),
              baseReceivableReliefAmount: base(relief),
              refundableAmount: original(20 - relief),
              baseRefundableAmount: base(20 - relief),
            });
          }
          await add('lbpReturnAllocation', 'sales_return_receivable_allocations', {
            salesReturnId: r.lbpCreditReturn,
            debtId: r.lbpDebt,
            amount: original(10),
            baseAmount: base(10),
            exchangeRate: '90000',
          });
          await add('lbpCredit', 'customer_credits', {
            branchId,
            salesReturnId: r.lbpCreditReturn,
            customerId: r.customer,
            issuedById: admin,
            currency: 'LBP',
            exchangeRate: '90000',
            issuedAmount: original(10),
            baseAmount: base(10),
          });
          await add('lbpRefund', 'cash_refunds', {
            branchId,
            salesReturnId: r.lbpCashReturn,
            customerId: r.customer,
            processedById: admin,
            currency: 'LBP',
            exchangeRate: '90000',
            amount: original(20),
            baseAmount: base(20),
          });
          await add('activity', 'activity_logs', {
            branchId,
            userId: admin,
            action: 'SYNTHETIC_BRANCH_ACTIVITY',
            entityType: 'Customer',
            entityId: r.customer,
            details: '{}',
          });
          const itemId = randomUUID();
          const before = side === 'a' ? 0 : 1;
          await add('receivingMovement', 'stock_movements', {
            productId: product,
            createdById: admin,
            movementType: 'PURCHASE_RECEIPT',
            quantityChange: 1,
            quantityBefore: before,
            quantityAfter: before + 1,
            referenceType: 'SUPPLIER_RECEIVING_ITEM',
            referenceId: itemId,
            createdAt: stamp,
          });
          await add('receivingItem', 'supplier_receiving_items', {
            id: itemId,
            receivingId: r.receiving,
            productId: product,
            quantity: 1,
            stockMovementId: r.receivingMovement,
          });

          await add('photo', 'supplier_receiving_receipts', {
            supplierReceivingId: r.receiving,
            capturedById: admin,
            mime: 'image/jpeg',
            filename: run + side + '.jpg',
            bytes: 3,
          });
        }
        await insertMigrationRow(tx, 'activity_logs', {
          userId: admin,
          branchId: null,
          action: 'SYNTHETIC_GLOBAL_ACTIVITY',
          entityType: 'Branch',
          entityId: a,
          details: '{}',
        });
        await tx.product.update({ where: { id: product }, data: { stockQuantity: 2 } });
      },
      { timeout: 120000 }
    );
  }, 120000);

  afterAll(async () => {
    try {
      // Children first; keep global catalog/other test data intact.
      const branch = { in: [a, b] };
      await db.supplierReceivingReceipt.deleteMany({
        where: { capturedById: { in: [admin, employee] } },
      });
      await db.supplierPurchaseLine.deleteMany({
        where: { supplierTransaction: { branchId: branch } },
      });
      await db.supplierAudit.deleteMany({ where: { changedById: { in: [admin, employee] } } });
      await db.supplierTransaction.deleteMany({ where: { branchId: branch } });
      await db.supplierReceivingAudit.deleteMany({ where: { receiving: { branchId: branch } } });
      await db.supplierReceivingItem.deleteMany({ where: { receiving: { branchId: branch } } });
      await db.supplierReceiving.deleteMany({ where: { branchId: branch } });
      await db.customerCreditApplication.deleteMany({
        where: { customerCredit: { branchId: branch } },
      });
      await db.cashRefund.deleteMany({ where: { branchId: branch } });
      await db.customerCredit.deleteMany({ where: { branchId: branch } });
      await db.salesReturnReceivableAllocation.deleteMany({
        where: { salesReturn: { branchId: branch } },
      });
      await db.salesReturnItem.deleteMany({ where: { salesReturn: { branchId: branch } } });
      await db.salesReturn.deleteMany({ where: { branchId: branch } });
      await db.salesAudit.deleteMany({ where: { changedById: { in: [admin, employee] } } });
      await db.salesOrderStockFulfillment.deleteMany({
        where: { salesOrder: { branchId: branch } },
      });
      await db.salesOrderItem.deleteMany({ where: { salesOrder: { branchId: branch } } });
      await db.paymentAllocation.deleteMany({ where: { payment: { branchId: branch } } });
      await db.payment.deleteMany({ where: { branchId: branch } });
      await db.salesOrder.deleteMany({ where: { branchId: branch } });
      await db.prepaidPurchase.deleteMany({ where: { debt: { branchId: branch } } });
      await db.installment.deleteMany({ where: { installmentPlan: { branchId: branch } } });
      await db.installmentPlan.deleteMany({ where: { branchId: branch } });
      await db.debt.deleteMany({ where: { branchId: branch } });
      await db.serviceAudit.deleteMany({ where: { changedById: { in: [admin, employee] } } });
      await db.serviceJob.deleteMany({ where: { branchId: branch } });
      await db.financialCorrectionAudit.deleteMany({
        where: { correctedById: { in: [admin, employee] } },
      });
      await db.stockMovement.deleteMany({ where: { createdById: { in: [admin, employee] } } });
      if (product) await db.product.deleteMany({ where: { id: product } });
      await db.taxProfile.deleteMany({ where: { id: taxProfileId } });
      await db.taxRate.deleteMany({ where: { id: taxRateId } });
      await db.customer.deleteMany({ where: { branchId: branch } });
      await db.supplier.deleteMany({ where: { branchId: branch } });
      await db.adminVerificationLog.deleteMany({ where: { userId: { in: [admin, employee] } } });
      await db.activityLog.deleteMany({ where: { userId: { in: [admin, employee] } } });
      await db.userBranchAccess.deleteMany({ where: { branchId: branch } });
      await db.branch.deleteMany({ where: { id: branch } });
      await db.user.deleteMany({ where: { id: { in: [admin, employee] } } });
      if (createdSettings) await db.businessSettings.delete({ where: { id: 'primary' } });
    } finally {
      if (receiptDir) await rm(receiptDir, { recursive: true, force: true });
      await db.branch.updateMany({ where: { id: { in: otherActive } }, data: { isActive: true } });
      vi.unstubAllEnvs();
      await db.$disconnect();
    }
  }, 120000);

  const dashboardNames = [
    'financial-summary',
    'overview',
    'customer-financial',
    'supplier-financial',
    'service-summary',
    'product-summary',
    'sales-summary',
    'alerts',
    'activity',
    'recent-activity',
    'month-end',
    'summary',
  ];
  const rowPaths = [
    'customers/new',
    'customers/debts',
    'customers/payments',
    'customers/receivables-aging',
    'customers/not-paid',
    'customers/paid',
    'products/bought',
    'products/cost-changes',
    'suppliers/debts',
    'suppliers/payables-aging',
    'suppliers/receiving',
    'sales/orders',
    'sales/unpaid',
    'inventory/movements',
    'inventory/reconciliation',
    'customers/financial-integrity',
    'suppliers/financial-integrity',
  ];
  const globalRows = [
    'products/bought',
    'products/cost-changes',
    'inventory/movements',
    'inventory/reconciliation',
  ];
  const reports = [
    ...rowPaths,
    'monthly-debts',
    'monthly-financial-activity',
    'monthly-review',
    'analysis',
  ];
  function dashboardUrl(name: string) {
    const query =
      name === 'month-end'
        ? 'month=' + month
        : ['activity', 'recent-activity'].includes(name)
          ? 'limit=50'
          : 'range=custom&from=' + from + '&to=' + today;
    return '/api/v1/dashboard/' + name + '?' + query;
  }
  function reportUrl(name: string, csv = false) {
    const query =
      name.startsWith('monthly-debts') || name.startsWith('monthly-financial-activity')
        ? 'month=' + month + '&limit=100'
        : 'period=custom&from=' + from + '&to=' + today;
    return '/api/v1/reports/' + name + (csv ? '/export.csv' : '') + '?' + query;
  }
  function data(res: { body: { data: Record<string, unknown> } }): Record<string, unknown> {
    const body = res.body.data;
    return body?.meta && body?.data ? (body.data as Record<string, unknown>) : body;
  }
  function clean(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(clean);
    if (value && typeof value === 'object')
      return Object.fromEntries(
        Object.entries(value)
          .filter(([key]) => !['generatedAt', 'operationalSnapshotAt', 'topDebtors'].includes(key))
          .map(([key, v]) => [key, clean(v)])
      );
    return value;
  }
  function additive(total: unknown, left: unknown, right: unknown, key = 'root'): number {
    // Global figures and derived rates remain their existing calculations.
    if (/inventory|stock|product|percent|average|ratio|rate|days|oldestDebt|oldestOverdue|largestCustomer|risk\.total/i.test(key)) return 0;
    if (typeof total === 'string' && /^-?\d+\.\d{2}$/.test(total)) {
      expect(new Decimal(String(left)).plus(String(right)).toFixed(2), key).toBe(total);
      return 1;
    }
    if (typeof total === 'number') {
      expect(new Decimal(String(left ?? 0)).plus(String(right ?? 0)).toString(), key).toBe(
        new Decimal(total).toString()
      );
      return 1;
    }
    if (Array.isArray(total)) {
      if (
        /top|rows|items|upcoming|recent|overdueCustomers|agingJobs|alerts|breakdown|findings|suppliers/i.test(
          key
        )
      )
        return 0;
      return total.reduce(
        (sum, v, index) =>
          sum +
          additive(
            v,
            (left as unknown[] | undefined)?.[index],
            (right as unknown[] | undefined)?.[index],
            key + '.' + (v && typeof v === 'object' && 'key' in v ? String(v.key) : index)
          ),
        0
      );
    }
    if (total && typeof total === 'object')
      return Object.entries(total)
        .filter(
          ([k]) => !['branchBreakdown', 'meta', 'pagination', 'operationalSnapshotAt'].includes(k)
        )
        .reduce(
          (sum, [k, v]) =>
            sum +
            additive(
              v,
              (left as Record<string, unknown> | undefined)?.[k],
              (right as Record<string, unknown> | undefined)?.[k],
              key + '.' + k
            ),
          0
        );
    return 0;
  }
  async function get(url: string, actor: 'admin' | 'employee' = 'admin', scope?: string) {
    const res = await call('GET', url, actor, scope);
    expect(res.status, url + ' ' + res.text).toBe(200);
    return res;
  }
  async function scopeValues(url: string) {
    const left = data(await get(url, 'admin', a)),
      right = data(await get(url, 'admin', b)),
      total = data(await get(url, 'admin', 'all'));
    return { left, right, total };
  }
  function assertBreakdown(
    total: Record<string, unknown>,
    left: Record<string, unknown>,
    right: Record<string, unknown>
  ) {
    const rows = total.branchBreakdown as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(2);
    for (const [id, expected] of [
      [a, left],
      [b, right],
    ] as const) {
      const row = rows.find((r) => r.branchId === id)!;
      expect(row.branchName).toBe('3C ' + (id === a ? 'A ' : 'B ') + run);
      expect(row.branchCode).toBeTruthy();
      const figures = Object.fromEntries(
        Object.entries(row).filter(
          ([key]) => !['branchId', 'branchName', 'branchCode'].includes(key)
        )
      );
      expect(clean(figures)).toEqual(clean(expected));
    }
    expect(left).not.toHaveProperty('branchBreakdown');
    expect(right).not.toHaveProperty('branchBreakdown');
  }

  it.each(dashboardNames)('dashboard %s rejects employee header B immediately', async (name) => {
    const res = await call('GET', dashboardUrl(name), 'employee', b);
    expect(res.status, res.text).toBe(403);
  });
  it.each(
    dashboardNames.filter(
      (n) => !['month-end', 'activity', 'recent-activity', 'alerts'].includes(n)
    )
  )('employee dashboard %s uses A figures and no-header single-branch scope', async (name) => {
    const url = dashboardUrl(name);
    const employeeA = data(await get(url, 'employee'));
    const explicitA = data(await get(url, 'employee', a));
    const adminA = data(await get(url, 'admin', a));
    expect(clean(employeeA)).toEqual(clean(explicitA));
    expect(clean(employeeA)).toEqual(clean(adminA));
    expect(employeeA).not.toHaveProperty('branchBreakdown');
  });
  it.each(
    dashboardNames.filter(
      (n) => !['product-summary', 'activity', 'recent-activity', 'alerts'].includes(n)
    )
  )(
    'dashboard %s has additive totals and exact per-branch breakdowns',
    async (name) => {
      const { left, right, total } = await scopeValues(dashboardUrl(name));
      assertBreakdown(total, left, right);
      expect(additive(total, left, right)).toBeGreaterThan(0);
    },
    30000
  );
  it.each(reports.filter((n) => !globalRows.includes(n)))(
    'report %s scopes A/B and adds exact branch breakdowns without changing totals',
    async (name) => {
      const { left, right, total } = await scopeValues(reportUrl(name));
      assertBreakdown(total, left, right);
      expect(additive(total, left, right)).toBeGreaterThan(0);
      if(name==='monthly-review') {
      const risk=total.risk as {total:number;inventoryScope:string;alerts:Array<{key:string;count:number}>};
      const globalCount=risk.alerts.filter(row=>row.key.startsWith('products-')).reduce((sum,row)=>sum+row.count,0);
      expect(risk.inventoryScope).toBe('all-branches');
      expect(risk.total).toBe((left.risk as {total:number}).total+(right.risk as {total:number}).total-globalCount);
    }
    for (const [id, payload] of [
        [a, left],
        [b, right],
      ] as const) {
        const rows = (payload.rows ?? payload.items) as
          Array<{ branchId: string; branchName: string }> | undefined;
        if (rows)
          for (const row of rows) {
            expect(row.branchId, name).toBe(id);
            expect(row.branchName, name).toBe('3C ' + (id === a ? 'A ' : 'B ') + run);
          }
      }
    },
    30000
  );
  it.each(globalRows)(
    'global report %s preserves shared inventory data and labels it',
    async (name) => {
      const { left, right, total } = await scopeValues(reportUrl(name));
      expect(clean(left)).toEqual(clean(right));
      expect(clean(left)).toEqual(clean(total));
      expect(left.inventoryScope).toBe('all-branches');
      expect(total).not.toHaveProperty('branchBreakdown');
      for (const row of left.rows as Array<Record<string, unknown>>)
        expect(row).not.toHaveProperty('branchName');
    }
  );
  it('keeps stock and product counts global in mixed dashboards and analysis', async () => {
    const product = await scopeValues(dashboardUrl('product-summary'));
    expect(clean(product.left)).toEqual(clean(product.right));
    expect(clean(product.left)).toEqual(clean(product.total));
    expect(product.total.inventoryScope).toBe('all-branches');
    const analysis = await scopeValues(reportUrl('analysis'));
    expect(analysis.left.inventoryPosition).toEqual(analysis.right.inventoryPosition);
    expect(analysis.left.inventoryPosition).toEqual(analysis.total.inventoryPosition);
    expect((analysis.total.inventoryPosition as { inventoryScope: string }).inventoryScope).toBe(
      'all-branches'
    );
  }, 30000);
  it('uses stored USD base amounts for LBP supplier and customer balances and keeps both sides separate', async () => {
    const supplier = await scopeValues(dashboardUrl('supplier-financial'));
    expect(supplier.left.totals).toMatchObject({ owed: '80.00' });
    expect(supplier.right.totals).toMatchObject({ owed: '160.00' });
    expect(supplier.total.totals).toMatchObject({ owed: '240.00' });
    // The evidence folder may not exist yet when this suite runs first.
    mkdirSync('node_modules/.cache/home-connect', { recursive: true });
    writeFileSync('node_modules/.cache/home-connect/phase3c-all-example.json',JSON.stringify({totals:supplier.total.totals,branchBreakdown:(supplier.total.branchBreakdown as Array<Record<string,unknown>>).map(row=>({branchId:row.branchId,branchCode:row.branchCode,branchName:row.branchName,totals:row.totals})),proof:'80.00 + 160.00 = 240.00'},null,2));
    const customer = await scopeValues(dashboardUrl('customer-financial'));
    expect(customer.left.totals).toMatchObject({ outstanding: '425.00' });
    expect(customer.right.totals).toMatchObject({ outstanding: '660.00' });
    expect(customer.total.totals).toMatchObject({ outstanding: '1085.00' });
    const analysis = data(await get(reportUrl('analysis'), 'admin', 'all'));
    expect(analysis.health).toHaveProperty('customerReceivables');
    expect(analysis.health).toHaveProperty('supplierPayables');
    expect(analysis.cashflow).toHaveProperty('netCollectionPosition');
    expect(JSON.stringify(analysis)).not.toMatch(
      /nettedBalance|netReceivablePayable|nettedPosition/
    );
  }, 30000);
  it('sums every receivables aging bucket independently', async () => {
    const { left, right, total } = await scopeValues(reportUrl('customers/receivables-aging'));
    expect((left.rows as unknown[]).length).toBeGreaterThanOrEqual(5);
    expect(additive(total.summary, left.summary, right.summary, 'aging')).toBeGreaterThan(0);
    const bucket = (rows: Array<{ bucket: string; remainingAmount: string }>, key: string) =>
      rows
        .filter((r) => r.bucket === key)
        .reduce((sum, r) => sum.plus(r.remainingAmount), new Decimal(0))
        .toFixed(2);
    for (const key of new Set((total.rows as Array<{ bucket: string }>).map((r) => r.bucket)))
      expect(
        new Decimal(bucket(left.rows as never, key))
          .plus(bucket(right.rows as never, key))
          .toFixed(2)
      ).toBe(bucket(total.rows as never, key));
  });
  it('keeps branch identity on top debtors and top supplier balances', async () => {
    const customers = data(await get(dashboardUrl('customer-financial'), 'admin', 'all'));
    const suppliers = data(await get(dashboardUrl('supplier-financial'), 'admin', 'all'));
    for (const rows of [customers.topDebtors, suppliers.topBalances] as Array<
      Array<{ branchId: string; branchName: string }>
    >) {
      expect(rows).toHaveLength(2);
      for (const row of rows) {
        expect([a, b]).toContain(row.branchId);
        expect(row.branchName).toBe('3C ' + (row.branchId === a ? 'A ' : 'B ') + run);
      }
    }
  });
  it('keeps report and month-end role checks while scoping admin reads', async () => {
    expect((await call('GET', reportUrl('monthly-review'), 'employee')).status).toBe(403);
    expect((await call('GET', dashboardUrl('month-end'), 'employee')).status).toBe(403);
    expect((await call('GET', reportUrl('customers/financial-integrity'), 'employee')).status).toBe(
      403
    );
  });
  it('isolates cached dashboard results by accessible branch set', async () => {
    const url = dashboardUrl('supplier-financial');
    const left = data(await get(url, 'admin', a)),
      right = data(await get(url, 'admin', b));
    expect(left.totals).not.toEqual(right.totals);
    expect(clean(data(await get(url, 'admin', a)))).toEqual(clean(left));
    expect(clean(data(await get(url, 'admin', b)))).toEqual(clean(right));
  });
  it.each(['activity', 'recent-activity'])(
    '%s hides B and NULL history from employees and allows NULL history for admins',
    async (name) => {
      const employeeA = data(await get(dashboardUrl(name), 'employee')).items as Array<{
        id: string;
        branchId: string | null;
      }>;
      expect(employeeA.length).toBeGreaterThan(0);
      expect(employeeA.every((r) => r.branchId === a)).toBe(true);
      expect(employeeA.some((r) => r.id === 'legacy:' + records.a.activity)).toBe(true);
      expect(employeeA.some((r) => r.id === 'legacy:' + records.b.activity)).toBe(false);
      const adminA = data(await get(dashboardUrl(name), 'admin', a)).items as Array<{
        id: string;
        branchId: string | null;
      }>;
      expect(adminA.some((r) => r.branchId === null)).toBe(true);
      expect(adminA.every((r) => r.branchId === a || r.branchId === null)).toBe(true);
    }
  );
  it('scopes each employee alert and labels its shared inventory component', async () => {
    const employeeData = data(await get(dashboardUrl('alerts'), 'employee'));
    const adminData = data(await get(dashboardUrl('alerts'), 'admin', a));
    expect(employeeData.inventoryScope).toBe('all-branches');
    for (const alert of employeeData.alerts as Array<{
      key: string;
      count: number;
      amount?: string;
    }>)
      expect(
        (adminData.alerts as Array<{ key: string }>).find((a) => a.key === alert.key)
      ).toMatchObject({ count: alert.count, ...(alert.amount ? { amount: alert.amount } : {}) });
  });
  it('prepends Branch to owned and analysis CSVs and leaves the global inventory CSV unchanged', async () => {
    for (const name of [
      'customers/new',
      'customers/financial-integrity',
      'monthly-debts',
      'monthly-financial-activity',
      'analysis',
    ]) {
      const res = await get(reportUrl(name, true), 'admin', a);
      expect(res.text.replace(/^\uFEFF/, '').split('\r\n')[0], name).toMatch(/^Branch,/);
      expect(res.text, name).toContain('3C A ' + run);
      expect(res.text, name).not.toContain('3C B ' + run);
    }
    const global = await get(reportUrl('inventory/movements', true), 'admin', a);
    expect(global.text.replace(/^\uFEFF/, '').split('\r\n')[0]).not.toMatch(/^Branch,/);
  }, 30000);
  it('applies grant revocation and deactivation on the next dashboard request', async () => {
    try {
      await db.userBranchAccess.deleteMany({ where: { userId: employee, branchId: a } });
      const empty = data(await get(dashboardUrl('customer-financial'), 'employee'));
      expect(empty.totals).toMatchObject({ totalCustomers: 0, outstanding: '0.00' });
      await db.userBranchAccess.create({
        data: { userId: employee, branchId: a, grantedById: admin },
      });
      await db.branch.update({ where: { id: a }, data: { isActive: false } });
      expect((await call('GET', dashboardUrl('overview'), 'employee', a)).status).toBe(403);
    } finally {
      await db.branch.update({ where: { id: a }, data: { isActive: true } });
      await db.userBranchAccess.createMany({
        data: [{ userId: employee, branchId: a, grantedById: admin }],
        skipDuplicates: true,
      });
    }
  });
  it('keeps report reads and exports free of financial or activity writes', async () => {
    const before = await state();
    await get(reportUrl('analysis'), 'admin', 'all');
    await get(reportUrl('customers/financial-integrity', true), 'admin', a);
    await get(dashboardUrl('month-end'), 'admin', 'all');
    expect(await state()).toEqual(before);
  }, 30000);
  it('records the created customer debt branch in the same financial transaction', async () => {
    const res = await call(
      'POST',
      '/api/v1/customers/' + records.a.customer + '/debts',
      'admin',
      a,
      { amount: '3', description: '3C activity proof', dueDate: today }
    );
    expect(res.status, res.text).toBe(201);
    const activity = await db.activityLog.findMany({
      where: { entityType: 'Debt', entityId: res.body.data.id },
    });
    expect(activity).toHaveLength(1);
    expect(activity[0]).toMatchObject({ branchId: a, userId: admin, action: 'DEBT_CREATED' });
  });
});
