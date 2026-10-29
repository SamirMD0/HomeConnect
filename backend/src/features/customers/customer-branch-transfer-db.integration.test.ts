import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '../../app';
import { resetAdminPasswordAttemptsForTests } from '../../lib/admin-verification';
import { insertMigrationRow } from '../../test/branch-migration-fixture';
import { isIsolatedTestDatabase } from '../../test/database';

const enabled = process.env.RUN_FINANCIAL_DB_TESTS === '1' && isIsolatedTestDatabase(process.env.DATABASE_URL);
const db = new PrismaClient();
const password = 'branch-transfer-synthetic-password';
const stamp = new Date('2026-10-01T10:00:00Z');

/** Tables whose branchId must follow the customer, in the order the seed creates them. */
const OWNED = ['customers', 'debts', 'installment_plans', 'sales_orders', 'payments', 'sales_returns', 'cash_refunds', 'customer_credits', 'service_jobs'] as const;

let run: string;
let a: string;
let b: string;
let admin: string;
let employee: string;
let tokens: { admin: string; employee: string };
let rows: Record<string, string>;
let accountCode: string;

const transfer = (customerId: string, body: object, actor: keyof typeof tokens = 'admin', scope = a) =>
  request(app)
    .post(`/api/v1/customers/${customerId}/branch-transfer`)
    .set('Authorization', 'Bearer ' + tokens[actor])
    .set('X-Branch-Scope', scope)
    .send(body);

async function branchOf(table: string, id: string) {
  const [row] = await db.$queryRawUnsafe<Array<{ branchId: string }>>(`SELECT "branchId" FROM "${table}" WHERE "id" = $1::uuid`, id);
  return row?.branchId;
}

async function snapshot() {
  const out: Record<string, string | undefined> = {};
  for (const key of Object.keys(rows)) {
    const table = key.split(':')[0];
    if ((OWNED as readonly string[]).includes(table)) out[key] = await branchOf(table, rows[key]);
  }
  return out;
}

async function debtTotals(customerId: string) {
  const [row] = await db.$queryRaw<Array<{ total: string }>>`
    SELECT coalesce(sum("baseOriginalAmount"), 0)::text AS total FROM "debts" WHERE "customerId" = ${customerId}::uuid`;
  return row.total;
}

(enabled ? describe : describe.skip)('customer branch transfer', () => {
  beforeAll(() => {
    const target = decodeURIComponent(new URL(process.env.DATABASE_URL!).pathname.slice(1));
    // The local test database or CI's (homeconnect_ci_...); never homeconnect.
    if (target === 'homeconnect' || !/^homeconnect_(?:test|ci)(?:[_-].*)?$/.test(target)) throw new Error('Refusing unsafe database ' + target);
  });

  beforeEach(async () => {
    vi.stubEnv('MULTI_BRANCH_SCOPING_ENABLED', 'true');
    resetAdminPasswordAttemptsForTests();
    run = randomUUID().replaceAll('-', '').slice(0, 12);
    accountCode = String(Date.now()) + String(Math.floor(Math.random() * 1000));
    a = randomUUID();
    b = randomUUID();
    admin = randomUUID();
    employee = randomUUID();
    const hash = await bcrypt.hash(password, 4);
    await db.user.createMany({
      data: [
        { id: admin, username: 'bt-admin-' + run, fullName: 'Transfer admin', role: 'ADMIN', password: hash },
        { id: employee, username: 'bt-emp-' + run, fullName: 'Transfer employee', role: 'EMPLOYEE', password: hash },
      ],
    });
    await db.branch.createMany({
      data: [
        { id: a, code: 'BTA' + run.slice(0, 6), name: 'Transfer A ' + run, createdById: admin },
        { id: b, code: 'BTB' + run.slice(0, 6), name: 'Transfer B ' + run, createdById: admin },
      ],
    });
    await db.userBranchAccess.createMany({
      data: [
        { userId: employee, branchId: a, grantedById: admin },
        { userId: employee, branchId: b, grantedById: admin },
      ],
    });
    tokens = {
      admin: jwt.sign({ userId: admin, role: 'ADMIN' }, process.env.JWT_SECRET!, { expiresIn: '1h' }),
      employee: jwt.sign({ userId: employee, role: 'EMPLOYEE' }, process.env.JWT_SECRET!, { expiresIn: '1h' }),
    };

    rows = {};
    await db.$transaction(async (tx) => {
      const add = async (key: string, values: Record<string, unknown>) =>
        (rows[key] = await insertMigrationRow(tx, key.split(':')[0], values));
      const owner = { branchId: a, createdById: admin };
      await add('customers:x', { branchId: a, createdBy: admin, name: 'Transfer customer ' + run, phone: 'bt-' + run });
      await add('customers:control', { branchId: a, createdBy: admin, name: 'Control customer ' + run, phone: 'bt-c-' + run });
      const x = rows['customers:x'];
      await add('debts:x', { ...owner, customerId: x, originalAmount: '120', baseOriginalAmount: '120', dueDate: stamp });
      await add('debts:control', { ...owner, customerId: rows['customers:control'], originalAmount: '50', baseOriginalAmount: '50', dueDate: stamp });
      await add('installment_plans:x', { ...owner, customerId: x, totalAmount: '100', baseTotalAmount: '100', startDate: stamp });
      await add('installments:x', { installmentPlanId: rows['installment_plans:x'], amountDue: '100', baseAmountDue: '100', dueDate: stamp });
      await add('sales_orders:x', {
        ...owner, customerId: x, orderDate: stamp, fulfillmentStatus: 'DELIVERED',
        totalAmount: '100', baseTotalAmount: '100', paidAmount: '0', basePaidAmount: '0', remainingAmount: '100', baseRemainingAmount: '100',
      });
      await add('sales_order_items:x', { salesOrderId: rows['sales_orders:x'], manualProductName: 'Transfer line', quantity: 1, taxRateSnapshot: '0', vatAmount: '0' });
      await add('payments:x', { ...owner, customerId: x, totalAmount: '10', baseAmount: '10', paymentDate: stamp });
      await add('payment_allocations:x', { paymentId: rows['payments:x'], installmentId: rows['installments:x'], amount: '10', paymentAmount: '10' });
      // Paid at the counter against the customer's order (found through salesOrderId).
      await add('payments:counter', {
        ...owner, customerId: x, salesOrderId: rows['sales_orders:x'], totalAmount: '10', baseAmount: '10', paymentDate: stamp,
        sourceSnapshot: JSON.stringify({ version: 1, orderNumber: 'BT counter', items: [] }),
      });
      for (const [key, method, sequence] of [['sales_returns:cash', 'CASH_OUT', 1], ['sales_returns:credit', 'STORE_CREDIT', 2]] as const) {
        await add(key, {
          branchId: a, salesOrderId: rows['sales_orders:x'], customerId: x, processedById: admin, sequence, refundMethod: method,
          returnDate: stamp, returnDeadlineSnapshot: stamp, totalIncVat: '10', baseTotalIncVat: '10', receivableReliefAmount: '0',
          baseReceivableReliefAmount: '0', refundableAmount: '10', baseRefundableAmount: '10',
        });
      }
      await add('cash_refunds:x', { branchId: a, salesReturnId: rows['sales_returns:cash'], customerId: x, processedById: admin });
      await add('customer_credits:x', { branchId: a, salesReturnId: rows['sales_returns:credit'], customerId: x, issuedById: admin });
      await add('service_jobs:x', { ...owner, customerId: x });
      await add('customer_imports:x', { branchId: a, createdById: admin });
      await tx.customerImportAccount.create({
        data: { branchId: a, accountCode: accountCode, customerId: x, sourceCustomerImportId: rows['customer_imports:x'], createdById: admin },
      });
    }, { timeout: 60_000 });
  });

  afterEach(async () => {
    const branches = [a, b];
    await db.$executeRaw`DELETE FROM "payment_allocations" WHERE "paymentId" IN (SELECT "id" FROM "payments" WHERE "branchId" = ANY(${branches}::uuid[]))`;
    for (const table of ['payments', 'cash_refunds', 'customer_credits']) {
      await db.$executeRawUnsafe(`DELETE FROM "${table}" WHERE "branchId" = ANY($1::uuid[])`, branches);
    }
    await db.$executeRaw`DELETE FROM "sales_returns" WHERE "branchId" = ANY(${branches}::uuid[])`;
    await db.$executeRaw`DELETE FROM "sales_order_items" WHERE "salesOrderId" IN (SELECT "id" FROM "sales_orders" WHERE "branchId" = ANY(${branches}::uuid[]))`;
    await db.$executeRaw`DELETE FROM "sales_orders" WHERE "branchId" = ANY(${branches}::uuid[])`;
    await db.$executeRaw`DELETE FROM "installments" WHERE "installmentPlanId" IN (SELECT "id" FROM "installment_plans" WHERE "branchId" = ANY(${branches}::uuid[]))`;
    for (const table of ['installment_plans', 'debts', 'service_jobs', 'customer_import_accounts', 'customer_imports']) {
      await db.$executeRawUnsafe(`DELETE FROM "${table}" WHERE "branchId" = ANY($1::uuid[])`, branches);
    }
    await db.activityLog.deleteMany({ where: { userId: { in: [admin, employee] } } });
    await db.adminVerificationLog.deleteMany({ where: { userId: { in: [admin, employee] } } });
    await db.customer.deleteMany({ where: { branchId: { in: branches } } });
    await db.userBranchAccess.deleteMany({ where: { userId: { in: [admin, employee] } } });
    await db.branch.deleteMany({ where: { id: { in: branches } } });
    await db.user.deleteMany({ where: { id: { in: [admin, employee] } } });
  });

  it('moves the customer and their whole history to the destination branch, leaving amounts unchanged', async () => {
    const before = await debtTotals(rows['customers:x']);
    const response = await transfer(rows['customers:x'], { toBranchId: b, accountPassword: password });
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.body.data.moved).toEqual({
      sales_orders: 1, sales_returns: 2, cash_refunds: 1, customer_credits: 1, payments: 2, debts: 1, installment_plans: 1, service_jobs: 1,
    });

    const after = await snapshot();
    for (const [key, branch] of Object.entries(after)) {
      expect(branch, key).toBe(key.endsWith(':control') ? a : b);
    }
    expect(await debtTotals(rows['customers:x'])).toBe(before);
    // The import-account link cannot follow (it belongs to the old branch's import): removed and audited.
    expect(await db.customerImportAccount.count({ where: { customerId: rows['customers:x'] } })).toBe(0);
    expect(response.body.data.detachedImportAccounts).toEqual([{ accountCode: accountCode, sourceCustomerImportId: rows['customer_imports:x'] }]);
    const audit = await db.activityLog.findFirst({ where: { action: 'CUSTOMER_BRANCH_TRANSFERRED', entityId: rows['customers:x'] } });
    expect(audit?.details).toMatchObject({ fromBranchId: a, toBranchId: b, moved: { payments: 2 } });
  });

  it('previews what would move without changing anything', async () => {
    const response = await request(app)
      .get(`/api/v1/customers/${rows['customers:x']}/branch-transfer/preview?toBranchId=${b}`)
      .set('Authorization', 'Bearer ' + tokens.admin)
      .set('X-Branch-Scope', 'all');
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.body.data).toMatchObject({ blocker: null, counts: { payments: 2, sales_returns: 2 }, importAccounts: [{ accountCode: accountCode }] });
    expect(await branchOf('customers', rows['customers:x'])).toBe(a);
  });

  it('requires the account password and changes nothing when it is wrong', async () => {
    const before = await snapshot();
    const response = await transfer(rows['customers:x'], { toBranchId: b, accountPassword: 'wrong-password' });
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(await snapshot()).toEqual(before);
  });

  it('is admin-only', async () => {
    const response = await transfer(rows['customers:x'], { toBranchId: b, accountPassword: password }, 'employee');
    expect(response.status).toBe(403);
    expect(await branchOf('customers', rows['customers:x'])).toBe(a);
  });

  it('refuses when the destination branch already has a customer with the same phone', async () => {
    await db.$transaction((tx) => insertMigrationRow(tx, 'customers', { branchId: b, createdBy: admin, name: 'Twin ' + run, phone: 'bt-' + run }));
    const before = await snapshot();
    const response = await transfer(rows['customers:x'], { toBranchId: b, accountPassword: password });
    expect(response.status).toBe(409);
    expect(response.body.error?.code ?? response.body.code).toBe('CUSTOMER_PHONE_EXISTS_IN_BRANCH');
    expect(await snapshot()).toEqual(before);
  });

  it('rolls back every moved row when the transfer fails at its last step', async () => {
    // Fail on the audit write, which runs after every row has already been moved.
    const fn = 'bt_fail_' + run;
    await db.$executeRawUnsafe(`CREATE FUNCTION ${fn}() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW."entityId" = '${rows['customers:x']}' THEN RAISE EXCEPTION 'simulated audit failure'; END IF; RETURN NEW; END; $$`);
    await db.$executeRawUnsafe(`CREATE TRIGGER ${fn} BEFORE INSERT ON "activity_logs" FOR EACH ROW EXECUTE FUNCTION ${fn}()`);
    try {
      const before = await snapshot();
      const response = await transfer(rows['customers:x'], { toBranchId: b, accountPassword: password });
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(await snapshot()).toEqual(before);
      expect(await db.customerImportAccount.count({ where: { customerId: rows['customers:x'] } })).toBe(1);
    } finally {
      await db.$executeRawUnsafe(`DROP TRIGGER IF EXISTS ${fn} ON "activity_logs"`);
      await db.$executeRawUnsafe(`DROP FUNCTION IF EXISTS ${fn}()`);
    }
  });

  it('still blocks any branch change outside a transfer, and still checks the links at commit', async () => {
    await expect(db.$executeRaw`UPDATE "customers" SET "branchId" = ${b}::uuid WHERE "id" = ${rows['customers:control']}::uuid`)
      .rejects.toThrow(/branchId cannot be changed/);
    // Even with the trigger allowed and links deferred, moving only the parent fails at COMMIT.
    await expect(db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL homeconnect.branch_transfer = 'on'`);
      await tx.$executeRawUnsafe('SET CONSTRAINTS ALL DEFERRED');
      await tx.$executeRaw`UPDATE "customers" SET "branchId" = ${b}::uuid WHERE "id" = ${rows['customers:control']}::uuid`;
    })).rejects.toThrow();
    expect(await branchOf('customers', rows['customers:control'])).toBe(a);
  });
});
