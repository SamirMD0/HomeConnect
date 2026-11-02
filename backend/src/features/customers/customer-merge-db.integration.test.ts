import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import request from 'supertest';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { app } from '../../app';
import { prisma } from '../../lib/prisma';
import { isIsolatedTestDatabase } from '../../test/database';
import { CustomerMergeService } from './customer-merge.service';
import { CustomerFinancialSummaryService } from '../financial/customer-summary/customer-financial-summary.service';
import { customerFinancialSummaryQuerySchema } from '../financial/customer-summary/customer-financial-summary.validator';

const enabled =
  process.env.RUN_FINANCIAL_DB_TESTS === '1' && isIsolatedTestDatabase(process.env.DATABASE_URL);
const db = new PrismaClient();
let a: string, b: string, owner: string, actor: { userId: string; role: string }, token: string;

const customer = (name: string, phone: string, branchId = a) =>
  db.customer.create({ data: { name, phone, branchId, createdBy: owner } });
const debt = (customerId: string, amount: number, branchId = a) =>
  db.debt.create({
    data: {
      branchId,
      customerId,
      originalAmount: amount,
      baseOriginalAmount: amount,
      dueDate: new Date('2026-05-01'),
      description: 'Debt',
      createdById: owner,
    },
  });
const payment = async (customerId: string, debtId: string, amount: number, branchId = a) => {
  const row = await db.payment.create({
    data: {
      branchId,
      customerId,
      totalAmount: amount,
      baseAmount: amount,
      paymentDate: new Date('2026-05-02'),
      createdById: owner,
      allocations: { create: { debtId, amount, paymentAmount: amount } },
    },
  });
  return row;
};
const outstanding = async (customerId: string) =>
  (
    await CustomerFinancialSummaryService.getCustomerFinancialSummary(
      customerId,
      customerFinancialSummaryQuerySchema.parse({ includePayments: 'false' })
    )
  ).summary.totalOutstanding;

(enabled ? describe : describe.skip)('customer merge', () => {
  beforeEach(async () => {
    owner = randomUUID();
    a = randomUUID();
    b = randomUUID();
    await db.user.create({
      data: {
        id: owner,
        username: 'merge-' + owner,
        fullName: 'Merge test admin',
        password: await bcrypt.hash('merge-only-synthetic-password', 4),
        role: 'ADMIN',
      },
    });
    actor = { userId: owner, role: 'ADMIN' };
    token = jwt.sign(actor, process.env.JWT_SECRET!);
    await db.branch.createMany({
      data: [
        { id: a, code: 'MRG-A-' + a, name: 'Merge A ' + a, createdById: owner },
        { id: b, code: 'MRG-B-' + b, name: 'Merge B ' + b, createdById: owner },
      ],
    });
  });
  afterEach(async () => {
    const branchIds = [a, b];
    await db.activityLog.deleteMany({ where: { userId: owner } });
    await db.paymentAllocation.deleteMany({ where: { payment: { createdById: owner } } });
    await db.payment.deleteMany({ where: { createdById: owner } });
    await db.salesOrder.deleteMany({ where: { branchId: { in: branchIds } } });
    await db.debt.deleteMany({ where: { branchId: { in: branchIds } } });
    await db.customerImportAccount.deleteMany({ where: { branchId: { in: branchIds } } });
    await db.customerImport.deleteMany({ where: { branchId: { in: branchIds } } });
    await db.customer.deleteMany({ where: { branchId: { in: branchIds } } });
    await db.branch.deleteMany({ where: { id: { in: branchIds } } });
    await db.user.delete({ where: { id: owner } });
  });
  afterAll(async () => {
    await db.$disconnect();
    await prisma.$disconnect();
  });

  it('covers every table that references a customer', async () => {
    const tables = await db.$queryRaw<Array<{ table: string }>>`
      SELECT DISTINCT c.conrelid::regclass::text AS "table"
      FROM pg_constraint c
      WHERE c.contype = 'f' AND c.confrelid = 'customers'::regclass`;
    expect(tables.map((row) => row.table.replaceAll('"', '')).sort()).toEqual(
      [
        'cash_refunds',
        'customer_credit_applications',
        'customer_credits',
        'customer_import_accounts',
        'debts',
        'financial_correction_audits',
        'installment_plans',
        'payments',
        'sales_orders',
        'sales_returns',
        'service_jobs',
      ].sort()
    );
  });
  it('lists same-name customers with balances, what can be cancelled and their history', async () => {
    const main = await customer('Najla Khatib', '71194334', a);
    const other = await customer(' najla khatib ', '', b);
    await customer('Someone Else', '70000000', a);
    await debt(main.id, 125);
    const partPaid = await debt(other.id, 100, b);
    await payment(other.id, partPaid.id, 40, b);
    await debt(other.id, 30, b);
    const { customers } = await CustomerMergeService.candidates(main.id, actor);
    expect(customers).toHaveLength(2);
    const view = customers.find((row) => row.id === other.id)!;
    expect(view.balances).toEqual([{ currency: 'USD', amount: '90.00' }]);
    expect(view.cancellable).toEqual([{ currency: 'USD', amount: '30.00' }]);
    expect(view.counts).toMatchObject({ debts: 2, payments: 1 });
  });
  it('adding both across branches moves all history, keeps every payment and archives the record', async () => {
    const keep = await customer('Najla Khatib', '71194334', a);
    const merged = await customer('Najla Khatib', '', b);
    await debt(keep.id, 100);
    const owed = await debt(merged.id, 50, b);
    const paid = await payment(merged.id, owed.id, 20, b);
    const result = await CustomerMergeService.merge(
      keep.id,
      { mergeCustomerId: merged.id, balance: 'ADD_BOTH' },
      actor
    );
    expect(result).toMatchObject({ customerId: keep.id, cancelledDebts: 0 });
    expect(await outstanding(keep.id)).toBe('130.00');
    expect(await db.debt.count({ where: { customerId: keep.id, branchId: a } })).toBe(2);
    expect(await db.payment.findUniqueOrThrow({ where: { id: paid.id } })).toMatchObject({
      customerId: keep.id,
      branchId: a,
    });
    const archived = await db.customer.findUniqueOrThrow({ where: { id: merged.id } });
    expect(archived.deletedAt).not.toBeNull();
    expect(await db.debt.count({ where: { customerId: merged.id } })).toBe(0);
    expect(
      await db.activityLog.count({ where: { entityId: keep.id, action: 'CUSTOMER_MERGED' } })
    ).toBe(1);
  });
  it('keeping one balance cancels only unpaid debts; a part-paid debt carries over', async () => {
    const keep = await customer('Najla Khatib', '71194334', a);
    const merged = await customer('Najla Khatib', '', b);
    await debt(keep.id, 125);
    const unpaid = await debt(merged.id, 125, b);
    const partPaid = await debt(merged.id, 50, b);
    await payment(merged.id, partPaid.id, 20, b);
    const result = await CustomerMergeService.merge(
      keep.id,
      { mergeCustomerId: merged.id, balance: 'KEEP_ONLY' },
      actor
    );
    expect(result.cancelledDebts).toBe(1);
    expect(await db.debt.findUniqueOrThrow({ where: { id: unpaid.id } })).toMatchObject({
      status: 'CANCELLED',
      customerId: keep.id,
    });
    expect(await outstanding(keep.id)).toBe('155.00');
    expect(await db.payment.count({ where: { customerId: keep.id } })).toBe(1);
  });
  it('merges a receipted sale, which the database otherwise refuses to repoint', async () => {
    const keep = await customer('Najla Khatib', '71194334', a);
    const merged = await customer('Najla Khatib', '', a);
    const order = await db.salesOrder.create({
      data: {
        branchId: a,
        customerId: merged.id,
        orderNumber: 'MRG-' + randomUUID(),
        salesChannel: 'SHOP_DIRECT',
        orderDate: new Date('2026-05-02'),
        itemsSubtotal: 10,
        totalAmount: 10,
        remainingAmount: 0,
        baseSubtotal: 10,
        baseTotalAmount: 10,
        basePaidAmount: 10,
        baseRemainingAmount: 0,
        createdById: owner,
      },
    });
    const paid = await db.payment.create({
      data: {
        branchId: a,
        customerId: merged.id,
        salesOrderId: order.id,
        sourceSnapshot: {},
        totalAmount: 10,
        baseAmount: 10,
        paymentDate: new Date('2026-05-02'),
        createdById: owner,
      },
    });
    await expect(
      db.salesOrder.update({ where: { id: order.id }, data: { customerId: keep.id } })
    ).rejects.toThrow();
    await CustomerMergeService.merge(
      keep.id,
      { mergeCustomerId: merged.id, balance: 'ADD_BOTH' },
      actor
    );
    expect(await db.salesOrder.findUniqueOrThrow({ where: { id: order.id } })).toMatchObject({
      customerId: keep.id,
    });
    expect(await db.payment.findUniqueOrThrow({ where: { id: paid.id } })).toMatchObject({
      customerId: keep.id,
    });
    // The exception ends with the merge's transaction.
    const third = await customer('Third', '70111222', a);
    await expect(
      db.salesOrder.update({ where: { id: order.id }, data: { customerId: third.id } })
    ).rejects.toThrow();
  });
  it('keeps the kept phone, fills blanks from the other record and handles an identical phone', async () => {
    const keep = await customer('Najla Khatib', '', a);
    const merged = await customer('Najla Khatib', '71194334', b);
    await db.customer.update({ where: { id: merged.id }, data: { address: 'Barja' } });
    await CustomerMergeService.merge(
      keep.id,
      { mergeCustomerId: merged.id, balance: 'ADD_BOTH' },
      actor
    );
    expect(await db.customer.findUniqueOrThrow({ where: { id: keep.id } })).toMatchObject({
      phone: '71194334',
      address: 'Barja',
      branchId: a,
    });
    const twin = await customer('Twin', '70123123', a);
    const twinOther = await customer('Twin', '70123123', b);
    await CustomerMergeService.merge(
      twin.id,
      { mergeCustomerId: twinOther.id, balance: 'ADD_BOTH' },
      actor
    );
    expect(await db.customer.findUniqueOrThrow({ where: { id: twin.id } })).toMatchObject({
      phone: '70123123',
    });
  });
  it('carries account numbers to the kept customer, so a later import finds them', async () => {
    const keep = await customer('Najla Khatib', '71194334', a);
    const merged = await customer('Najla Khatib', '', b);
    const source = await db.customerImport.create({
      data: {
        branchId: b,
        fileName: 'x.csv',
        fileHash: 'x',
        columnMapping: {},
        rows: {},
        createdById: owner,
      },
    });
    await db.customerImportAccount.create({
      data: {
        branchId: b,
        accountCode: '41100',
        customerId: merged.id,
        sourceCustomerImportId: source.id,
        createdById: owner,
      },
    });
    await CustomerMergeService.merge(
      keep.id,
      { mergeCustomerId: merged.id, balance: 'ADD_BOTH' },
      actor
    );
    expect(await db.customerImportAccount.findMany({ where: { accountCode: '41100' } })).toEqual([
      expect.objectContaining({ branchId: a, customerId: keep.id }),
    ]);
  });
  it('refuses a different name or the same record, and rolls back on an account conflict', async () => {
    const keep = await customer('Najla Khatib', '71194334', a);
    const stranger = await customer('Someone Else', '70000000', b);
    await expect(
      CustomerMergeService.merge(
        keep.id,
        { mergeCustomerId: stranger.id, balance: 'ADD_BOTH' },
        actor
      )
    ).rejects.toMatchObject({ code: 'CUSTOMER_MERGE_NAME_MISMATCH' });
    await expect(
      CustomerMergeService.merge(keep.id, { mergeCustomerId: keep.id, balance: 'ADD_BOTH' }, actor)
    ).rejects.toMatchObject({ statusCode: 400 });
    const merged = await customer('Najla Khatib', '', b);
    const holder = await customer('Holder', '70999999', a);
    const inA = await db.customerImport.create({
      data: { branchId: a, fileName: 'a', fileHash: 'a', columnMapping: {}, rows: {}, createdById: owner },
    });
    const inB = await db.customerImport.create({
      data: { branchId: b, fileName: 'b', fileHash: 'b', columnMapping: {}, rows: {}, createdById: owner },
    });
    await db.customerImportAccount.createMany({
      data: [
        { branchId: a, accountCode: '500', customerId: holder.id, sourceCustomerImportId: inA.id, createdById: owner },
        { branchId: b, accountCode: '500', customerId: merged.id, sourceCustomerImportId: inB.id, createdById: owner },
      ],
    });
    const owed = await debt(merged.id, 10, b);
    await expect(
      CustomerMergeService.merge(keep.id, { mergeCustomerId: merged.id, balance: 'KEEP_ONLY' }, actor)
    ).rejects.toMatchObject({ code: 'CUSTOMER_MERGE_ACCOUNT_CONFLICT' });
    expect(await db.debt.findUniqueOrThrow({ where: { id: owed.id } })).toMatchObject({
      status: 'UNPAID',
      branchId: b,
      customerId: merged.id,
    });
    expect((await db.customer.findUniqueOrThrow({ where: { id: merged.id } })).deletedAt).toBeNull();
  });
  it('routes are admin-only and need no password', async () => {
    const keep = await customer('Najla Khatib', '71194334', a);
    const merged = await customer('Najla Khatib', '', b);
    const send = (path: string, body?: object, method: 'get' | 'post' = 'post', scope?: string) => {
      const url = '/api/v1/customers/merges/' + keep.id + path;
      const call = request(app)[method](url).set('Authorization', 'Bearer ' + token);
      if (scope) call.set('X-Branch-Scope', scope);
      return call.send(body);
    };
    expect((await send('/candidates', undefined, 'get')).body.data.customers).toHaveLength(2);
    expect((await send('', { mergeCustomerId: merged.id, balance: 'SOMETHING' })).status).toBe(400);
    // Works from the All view and from a branch that does not hold the kept record.
    expect(
      (await send('', { mergeCustomerId: merged.id, balance: 'ADD_BOTH' }, 'post', b)).status
    ).toBe(200);
    await db.user.update({ where: { id: owner }, data: { role: 'EMPLOYEE' } });
    token = jwt.sign({ userId: owner, role: 'EMPLOYEE' }, process.env.JWT_SECRET!);
    expect((await send('/candidates', undefined, 'get')).status).toBe(403);
  });
});
