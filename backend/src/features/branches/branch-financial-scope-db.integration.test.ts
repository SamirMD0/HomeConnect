import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
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
const password = 'phase3b-synthetic-password';
type Records = Record<string, string>;
const records: Record<'a' | 'b', Records> = { a: {}, b: {} };
let tokens: Record<'admin' | 'employee', string>;
let receiptDir: string;
let product: string;
let createdSettings = false;
const taxProfileId = randomUUID(),
  taxRateId = randomUUID();
const stamp = new Date('2026-08-15');
const tables = [
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

// Enumerate every existing by-id route, including admin actions and receipt URLs.
const byId: Array<[string, string, string, string]> = [
  ...[
    'GET :id',
    'GET :id/payments',
    'PATCH :id',
    'POST :id/corrections',
    'POST :id/payments',
    'POST :id/cancel',
  ].map((s) => {
    const [method, suffix] = s.split(' ');
    return [method, 'debts/' + suffix, 'debt', 'Debt not found'] as [
      string,
      string,
      string,
      string,
    ];
  }),
  ...[
    'GET :id',
    'GET :id/payments',
    'PATCH :id',
    'POST :id/corrections',
    'POST :id/payments',
    'POST :id/cancel',
  ].map((s) => {
    const [method, suffix] = s.split(' ');
    return [method, 'installment-plans/' + suffix, 'plan', 'Installment plan not found'] as [
      string,
      string,
      string,
      string,
    ];
  }),
  ...['GET :id/receipt', 'POST :id/void', 'POST :id/corrections', 'POST :id/reallocate'].map(
    (s) => {
      const [method, suffix] = s.split(' ');
      return [method, 'payments/' + suffix, 'payment', 'Payment not found'] as [
        string,
        string,
        string,
        string,
      ];
    }
  ),
  ...['GET :id', 'POST :id/deliver', 'POST :id/revert-delivery'].map((s) => {
    const [method, suffix] = s.split(' ');
    return [method, 'prepaid-purchases/' + suffix, 'prepaid', 'Prepaid purchase not found'] as [
      string,
      string,
      string,
      string,
    ];
  }),
  ...[
    'GET :id',
    'GET :id/audit',
    'POST :id/fulfillment-status',
    'POST :id/payment',
    'POST :id/cancel',
    'POST :id/restore',
    'POST :id/return',
    'POST :id/create-debt',
    'POST :id/create-installment-plan',
    'POST :id/unlink-financial',
    'POST :id/items',
    'PATCH :id/items/:item',
    'POST :id/items/:item/remove',
    'POST :id/deduct-stock',
    'POST :id/restore-stock',
    'PATCH :id',
  ].map((s) => {
    const [method, suffix] = s.split(' ');
    return [method, 'sales-orders/' + suffix, 'order', 'Sales order not found'] as [
      string,
      string,
      string,
      string,
    ];
  }),
  ['GET', 'sales-returns/:id', 'return', 'Sales return not found'],
  ...[
    'GET :id',
    'GET :id/audit',
    'POST :id/status',
    'POST :id/cancel',
    'POST :id/reopen',
    'PATCH :id',
  ].map((s) => {
    const [method, suffix] = s.split(' ');
    return [method, 'service-jobs/' + suffix, 'job', 'Service job not found'] as [
      string,
      string,
      string,
      string,
    ];
  }),
  ...['GET :id', 'PATCH :id', 'POST :id/remove', 'POST :id/restore'].map((s) => {
    const [method, suffix] = s.split(' ');
    return [
      method,
      'supplier-transactions/' + suffix,
      'transaction',
      'Supplier transaction not found',
    ] as [string, string, string, string];
  }),
  ['GET', 'supplier-purchases/:id', 'purchase', 'Purchase not found / الفاتورة غير موجودة'],
  [
    'GET',
    'supplier-purchases/:id/receipts',
    'receiving',
    'The supplier purchase for this receipt was not found.',
  ],
  [
    'POST',
    'supplier-purchases/:id/receipts',
    'receiving',
    'The supplier purchase for this receipt was not found.',
  ],
  ...['GET :id', 'PATCH :id/metadata', 'POST :id/void'].map((s) => {
    const [method, suffix] = s.split(' ');
    return [
      method,
      'inventory/receivings/' + suffix,
      'receiving',
      'Receiving not found / مستند الاستلام غير موجود',
    ] as [string, string, string, string];
  }),
];
const urlFor = (pattern: string, side: 'a' | 'b', key: string) =>
  '/api/v1/' + pattern.replace(':id', records[side][key]).replace(':item', records[side].item);
const prefixes = [
  'debts',
  'installment-plans',
  'payments',
  'financial-ledger',
  'receivables',
  'prepaid-purchases',
  'corrections',
  'sales-orders',
  'sales-returns',
  'service-jobs',
  'supplier-transactions',
  'supplier-purchases',
  'supplier-ledger',
  'inventory/receivings',
];
const lists = [
  'financial-ledger',
  'receivables',
  'prepaid-purchases',
  'corrections',
  'sales-orders',
  'service-jobs',
  'supplier-transactions',
  'supplier-ledger',
  'inventory/receivings',
];
const listRows = (body: { data: unknown }): Array<{ id: string; branchId: string }> => {
  const data = body.data as
    | {
        matches?: Array<{ id: string; branchId: string }>;
        items?: Array<{ id: string; branchId: string }>;
      }
    | Array<{ id: string; branchId: string }>;
  return Array.isArray(data) ? data : (data.items ?? data.matches)!;
};
const sale = (customerId?: string) => ({
  customerId,
  salesChannel: 'SHOP_DIRECT',
  orderDate: '2026-08-15',
  paidAmount: '10',
  idempotencyKey: randomUUID(),
  items: [
    {
      manualProductName: '3B manual item',
      quantity: 1,
      unitPrice: '10',
      taxProfileId,
    },
  ],
});
const receiving = (supplierId?: string) => ({
  supplierId,
  items: [{ productId: product, quantity: 1 }],
  receivedOn: '2026-08-15',
});
const job = (customerId: string) => ({
  customerId,
  manualProductName: '3B repair item',
  requestType: 'WORKSHOP_DROP_OFF',
  issueDescription: 'Synthetic repair',
  serviceCreatedDate: '2026-08-15',
});
const transaction = (supplierReceivingId?: string) => ({
  type: 'SUPPLIER_DEBT',
  amount: '10',
  currency: 'USD',
  transactionDate: '2026-08-15',
  description: 'Synthetic purchase',
  supplierReceivingId,
});

describe.runIf(enabled)('Phase 3B financial and sales branch isolation (real database)', () => {
  beforeAll(async () => {
    const name = decodeURIComponent(new URL(process.env.DATABASE_URL!).pathname.slice(1));
    if (name === 'homeconnect' || name !== 'homeconnect_test_phase4_phase5_phase6')
      throw Error('Unsafe Phase 3B target');
    console.log('Confirmed Phase 3B database: ' + name);
    vi.stubEnv('MULTI_BRANCH_SCOPING_ENABLED', 'true');
    receiptDir = await mkdtemp(path.join(tmpdir(), 'homeconnect-phase3b-'));
    vi.stubEnv('RECEIPTS_DIR', receiptDir);
    if (!(await db.businessSettings.findUnique({ where: { id: 'primary' } }))) {
      await db.businessSettings.create({ data: { id: 'primary' } });
      createdSettings = true;
    }
    const hash = await bcrypt.hash(password, 4);
    await db.user.createMany({
      data: [
        {
          id: admin,
          username: '3b-admin-' + run,
          fullName: '3B admin',
          role: 'ADMIN',
          password: hash,
        },
        {
          id: employee,
          username: '3b-employee-' + run,
          fullName: '3B employee',
          role: 'EMPLOYEE',
          password: hash,
        },
      ],
    });
    await db.taxRate.create({
      data: {
        id: taxRateId,
        code: '3B_RATE_' + run,
        name: '3B zero rate',
        nameAr: '3B',
        ratePercent: '0',
        effectiveFrom: stamp,
        createdById: admin,
      },
    });
    await db.taxProfile.create({
      data: {
        id: taxProfileId,
        code: '3B_PROFILE_' + run,
        name: '3B test profile',
        nameAr: '3B',
        taxRateId,
      },
    });
    await db.branch.createMany({
      data: [
        { id: a, code: '3BA' + run.slice(0, 8), name: '3B A ' + run, createdById: admin },
        { id: b, code: '3BB' + run.slice(0, 8), name: '3B B ' + run, createdById: admin },
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
            name: '3B customer ' + run,
            phone: '3b-' + run + side,
          });
          await add('supplier', 'suppliers', {
            branchId,
            createdById: admin,
            name: '3B supplier ' + run,
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
            manualProductName: '3B manual line',
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
            sourceSnapshot: JSON.stringify({ version: 1, orderNumber: '3B counter', items: [] }),
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
            receiptNumber: '3B-' + run,
          });
          await add('purchaseLine', 'supplier_purchase_lines', {
            supplierTransactionId: r.purchase,
            kind: 'MANUAL',
            description: '3B line',
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
          await add('photo', 'supplier_receiving_receipts', {
            supplierReceivingId: r.receiving,
            capturedById: admin,
            mime: 'image/jpeg',
            filename: run + side + '.jpg',
            bytes: 3,
          });
        }
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
      vi.unstubAllEnvs();
      await db.$disconnect();
    }
  }, 120000);

  it.each(byId)(
    '%s %s hides B before validation/roles and leaves all records unchanged',
    async (method, pattern, key, message) => {
      const before = await state();
      const res = await call(method, urlFor(pattern, 'b', key));
      expect(res.status, res.text).toBe(404);
      expect(res.body.error).toMatchObject({ code: 'NOT_FOUND', message });
      expect(await state()).toEqual(before);
    }
  );
  it.each(prefixes)('%s rejects employee header B on the next request', async (prefix) => {
    const res = await call('GET', '/api/v1/' + prefix, 'employee', b);
    expect(res.status, res.text).toBe(403);
  });
  it.each(lists)('%s filters A, admin A and admin all with branchId metadata', async (prefix) => {
    for (const [actor, scope] of [
      ['employee', undefined],
      ['admin', a],
      ['admin', 'all'],
    ] as const) {
      const res = await call('GET', '/api/v1/' + prefix, actor, scope);
      if (prefix === 'corrections' && actor === 'employee') {
        expect(res.status, res.text).toBe(403);
        continue;
      }
      expect(res.status, res.text).toBe(200);
      const rows = listRows(res.body);
      expect(
        rows.some((r) => r.branchId === a),
        res.text
      ).toBe(true);
      if (scope === 'all')
        expect(
          rows.some((r) => r.branchId === b),
          res.text
        ).toBe(true);
      else
        expect(
          rows.every((r) => r.branchId === a),
          res.text
        ).toBe(true);
    }
  });
  it('keeps walk-in counter receipts and customerless correction ownership in the ledger', async () => {
    const res = await call('GET', '/api/v1/financial-ledger?includeCompleted=true');
    expect(res.status, res.text).toBe(200);
    expect(listRows(res.body).map((r) => r.id)).toContain(records.a.counter);
    expect(listRows(res.body).map((r) => r.id)).not.toContain(records.b.counter);
    const corrections = await call('GET', '/api/v1/corrections', 'admin', a);
    expect(listRows(corrections.body).map((r) => r.id)).toEqual(
      expect.arrayContaining([records.a.counterCorrection, records.a.billingCorrection])
    );
  });
  it.each([
    'sales-orders',
    'service-jobs',
    'supplier-transactions',
    'financial-ledger',
    'receivables',
  ])('%s scopes searches as well as lists', async (prefix) => {
    const res = await call('GET', '/api/v1/' + prefix + '?search=' + encodeURIComponent(run));
    expect(res.status, res.text).toBe(200);
    expect(
      listRows(res.body).every((r) => r.branchId === a),
      res.text
    ).toBe(true);
  });
  it.each([
    ['debts/:id', 'debt'],
    ['installment-plans/:id', 'plan'],
    ['payments/:id/receipt', 'payment'],
    ['payments/:id/receipt', 'counter'],
    ['prepaid-purchases/:id', 'prepaid'],
    ['sales-orders/:id', 'order'],
    ['sales-orders/:id', 'walkin'],
    ['sales-returns/:id', 'return'],
    ['sales-returns/:id', 'creditReturn'],
    ['service-jobs/:id', 'job'],
    ['supplier-transactions/:id', 'transaction'],
    ['supplier-purchases/:id', 'purchase'],
    ['inventory/receivings/:id', 'receiving'],
    ['inventory/receivings/:id', 'anonymousReceiving'],
  ])('%s %s exposes branchId for an in-scope detail', async (pattern, key) => {
    const res = await call('GET', urlFor(pattern, 'a', key));
    expect(res.status, res.text).toBe(200);
    expect(res.body.data.branchId, res.text).toBe(a);
    if (key === 'return') expect(res.body.data.cashRefund.branchId).toBe(a);
    if (key === 'creditReturn') expect(res.body.data.customerCredit.branchId).toBe(a);
  });
  it('adds inherited branchId to sales and service audit history', async () => {
    for (const route of [
      'sales-orders/' + records.a.order + '/audit',
      'service-jobs/' + records.a.job + '/audit',
    ]) {
      const res = await call('GET', '/api/v1/' + route, 'admin', a);
      expect(res.status, res.text).toBe(200);
      expect(res.body.data.length).toBeGreaterThan(0);
      expect(res.body.data.every((row: { branchId: string }) => row.branchId === a)).toBe(true);
    }
  });
  it('scopes supplier purchase lists, receipt checks, and receipt photo metadata', async () => {
    const r = records.a;
    for (const url of [
      'suppliers/' + r.supplier + '/purchases',
      'supplier-purchases/receipt-check?supplierId=' + r.supplier + '&receiptNumber=3B-' + run,
      'supplier-purchases/' + r.receiving + '/receipts',
    ]) {
      const res = await call('GET', '/api/v1/' + url);
      expect(res.status, res.text).toBe(200);
      expect(listRows(res.body).length).toBeGreaterThan(0);
      expect(listRows(res.body).every((row) => row.branchId === a)).toBe(true);
    }
  });
  it('creates customer financial and supplier records in selected branch A', async () => {
    const r = records.a;
    const cases: Array<[string, object]> = [
      [
        'customers/' + r.customer + '/debts',
        { amount: '12', description: '3B new debt', dueDate: '2026-08-15' },
      ],
      [
        'customers/' + r.customer + '/prepaid-purchases',
        { itemName: '3B prepaid', paymentAmount: '1', fullAmount: '12' },
      ],
      [
        'customers/' + r.customer + '/installment-plans',
        { totalAmount: '12', description: '3B plan', startDate: '2026-08-15', installmentCount: 2 },
      ],
      ['suppliers/' + r.supplier + '/transactions', transaction()],
      [
        'suppliers/' + r.supplier + '/purchases',
        {
          transactionDate: '2026-08-15',
          description: '3B purchase',
          receiveStock: false,
          lines: [{ kind: 'MANUAL', description: '3B freight', amount: '12', taxProfileId }],
        },
      ],
      ['inventory/receivings', receiving(r.supplier)],
      ['debts/' + r.debt + '/payments', { amount: '1', paymentDate: '2026-08-15' }],
      ['installment-plans/' + r.plan + '/payments', { amount: '1', paymentDate: '2026-08-15' }],
    ];
    for (const [route, input] of cases) {
      const res = await call('POST', '/api/v1/' + route, 'admin', a, input);
      expect(res.status, route + ' ' + res.text).toBe(201);
      expect(res.body.data.branchId, route + ' ' + res.text).toBe(a);
    }
  });
  it('rejects B installment allocation before verification logs or financial writes', async () => {
    const before = await state();
    const res = await call(
      'POST',
      '/api/v1/payments/' + records.a.payment + '/reallocate',
      'admin',
      a,
      {
        allocations: [{ installmentId: records.b.installment, amount: '10' }],
        reason: '3B cross branch allocation',
        accountPassword: password,
      }
    );
    expect(res.status, res.text).toBe(404);
    expect(res.body.error.message).toBe('Installment not found');
    expect(await state()).toEqual(before);
  });
  it('rejects A supplier transaction linked to B receiving without writes', async () => {
    const before = await state();
    const res = await call(
      'POST',
      '/api/v1/suppliers/' + records.a.supplier + '/transactions',
      'admin',
      a,
      transaction(records.b.receiving)
    );
    expect(res.status, res.text).toBe(404);
    expect(res.body.error.message).toBe('Receiving document not found / مستند الإدخال غير موجود');
    expect(await state()).toEqual(before);
  });
  it('rejects B sales-order line on an A return without writes', async () => {
    const before = await state();
    const res = await call(
      'POST',
      '/api/v1/sales-orders/' + records.a.order + '/return',
      'admin',
      a,
      {
        idempotencyKey: '3b-return-' + run,
        items: [{ salesOrderItemId: records.b.item, quantity: 1, stockDisposition: 'QUARANTINE' }],
        refundMethod: 'CASH_OUT',
        reason: '3B cross branch return',
        accountPassword: password,
        overrideReturnWindow: true,
        windowOverrideReason: 'Synthetic expired return window',
      }
    );
    expect(res.status, res.text).toBe(404);
    expect(await state()).toEqual(before);
  });
  it('denies B receipt upload before creating a file and permits an A upload', async () => {
    const before = await readdir(receiptDir);
    const denied = await request(app)
      .post('/api/v1/supplier-purchases/' + records.b.receiving + '/receipts')
      .set(headers())
      .set('Content-Type', 'image/jpeg')
      .send(Buffer.from([1, 2, 3]));
    expect(denied.status, denied.text).toBe(404);
    expect(await readdir(receiptDir)).toEqual(before);
    const allowed = await request(app)
      .post('/api/v1/supplier-purchases/' + records.a.receiving + '/receipts')
      .set(headers())
      .set('Content-Type', 'image/jpeg')
      .send(Buffer.from([1, 2, 3]));
    expect(allowed.status, allowed.text).toBe(201);
    expect(allowed.body.data.branchId).toBe(a);
  });
  it('rejects every available create in multi-branch all before any write', async () => {
    const routes = [
      'sales-orders',
      'service-jobs',
      'inventory/receivings',
      ...['debts', 'prepaid-purchases', 'installment-plans'].map(
        (p) => 'customers/' + records.a.customer + '/' + p
      ),
      ...['transactions', 'purchases'].map((p) => 'suppliers/' + records.a.supplier + '/' + p),
    ];
    for (const route of routes) {
      const before = await state();
      const res = await call('POST', '/api/v1/' + route, 'admin', 'all');
      expect(res.status, route + ' ' + res.text).toBe(409);
      expect(res.body.error.code).toBe('BRANCH_SELECTION_REQUIRED');
      expect(await state()).toEqual(before);
    }
  });
  it('rejects in-scope record mutations in multi-branch all', async () => {
    for (const [method, pattern, key] of byId.filter(([method]) => method !== 'GET')) {
      const res = await call(method, urlFor(pattern, 'a', key), 'admin', 'all');
      expect(res.status, pattern + ' ' + res.text).toBe(409);
      expect(res.body.error.code).toBe('BRANCH_SELECTION_REQUIRED');
    }
  });
  it('creates walk-in sales and supplier-less receivings in header A and sole accessible no-header scope', async () => {
    for (const [actor, scope] of [
      ['admin', a],
      ['employee', undefined],
    ] as const) {
      for (const [route, input] of [
        ...(actor === 'admin' ? [['sales-orders', sale()] as const] : []),
        ['inventory/receivings', receiving()] as const,
      ]) {
        const res = await call('POST', '/api/v1/' + route, actor, scope, input);
        expect(res.status, res.text).toBe(201);
        expect(res.body.data.branchId).toBe(a);
      }
    }
  });
  it('keeps no-header walk-in creation unchanged for an admin with one active branch', async () => {
    const otherActive = await db.branch.findMany({
      where: { id: { not: a }, isActive: true },
      select: { id: true },
    });
    try {
      await db.branch.updateMany({
        where: { id: { in: otherActive.map((row) => row.id) } },
        data: { isActive: false },
      });
      const res = await call('POST', '/api/v1/sales-orders', 'admin', undefined, sale());
      expect(res.status, res.text).toBe(201);
      expect(res.body.data.branchId).toBe(a);
    } finally {
      await db.branch.updateMany({
        where: { id: { in: otherActive.map((row) => row.id) } },
        data: { isActive: true },
      });
    }
  });
  it('creates parent-owned sales and service jobs in A and hides B customers', async () => {
    for (const [route, input] of [
      ['sales-orders', sale(records.a.customer)],
      ['service-jobs', job(records.a.customer)],
    ] as const) {
      const res = await call('POST', '/api/v1/' + route, 'admin', a, input);
      expect(res.status, res.text).toBe(201);
      expect(res.body.data.branchId).toBe(a);
    }
    for (const [route, input] of [
      ['sales-orders', sale(records.b.customer)],
      ['service-jobs', job(records.b.customer)],
      ['inventory/receivings', receiving(records.b.supplier)],
    ] as const) {
      const before = await state();
      const res = await call('POST', '/api/v1/' + route, 'admin', a, input);
      expect(res.status, res.text).toBe(404);
      expect(await state()).toEqual(before);
    }
  });
  it.each([
    'financial-ledger',
    'sales-orders',
    'service-jobs',
    'supplier-transactions',
    'inventory/receivings',
  ])('%s observes grant revocation and branch deactivation on the next request', async (prefix) => {
    try {
      await db.userBranchAccess.deleteMany({ where: { userId: employee, branchId: a } });
      const revoked = await call('GET', '/api/v1/' + prefix);
      expect(revoked.status, revoked.text).toBe(200);
      expect(listRows(revoked.body)).toEqual([]);
      await db.userBranchAccess.create({
        data: { userId: employee, branchId: a, grantedById: admin },
      });
      await db.branch.update({ where: { id: a }, data: { isActive: false } });
      const inactive = await call('GET', '/api/v1/' + prefix, 'employee', a);
      expect(inactive.status, inactive.text).toBe(403);
    } finally {
      await db.branch.update({ where: { id: a }, data: { isActive: true } });
      await db.userBranchAccess.createMany({
        data: [{ userId: employee, branchId: a, grantedById: admin }],
        skipDuplicates: true,
      });
    }
  });
  it('leaves global inventory summary, movements and onboarding outside branch scope', async () => {
    for (const url of ['summary', 'low-stock', 'movements', 'onboarding/pending']) {
      const res = await call('GET', '/api/v1/inventory/' + url, 'admin', b);
      expect(res.status, res.text).toBe(200);
    }
  });
});
