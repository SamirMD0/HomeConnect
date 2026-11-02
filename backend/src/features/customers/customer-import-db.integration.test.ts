import { PrismaClient } from '@prisma/client';
import { randomUUID, createHash } from 'node:crypto';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { app } from '../../app';
import { prisma } from '../../lib/prisma';
import { isIsolatedTestDatabase } from '../../test/database';
import { CustomerImportService } from './customer-import.service';
import { DebtsService } from '../financial/debts/debts.service';
import { CustomerFinancialSummaryService } from '../financial/customer-summary/customer-financial-summary.service';
import { customerFinancialSummaryQuerySchema } from '../financial/customer-summary/customer-financial-summary.validator';
import { resetAdminPasswordAttemptsForTests } from '../../lib/admin-verification';
import type { CustomerImportDecision } from './customer-import.validator';

const enabled =
  process.env.RUN_FINANCIAL_DB_TESTS === '1' && isIsolatedTestDatabase(process.env.DATABASE_URL);
const db = new PrismaClient();
const password = 'phase5-only-synthetic-password';
let a: string, b: string, owner: string, actor: { userId: string; role: string }, token: string;
const create = (csvText: string, branchId = a) =>
  CustomerImportService.createDraft({ branchId, fileName: 'customers.csv', csvText }, actor);
const commit = (
  id: string,
  decisions: CustomerImportDecision[] = [],
  accountPassword?: string,
  dueDate: string | null = '2027-06-30'
) =>
  CustomerImportService.commit(
    id,
    { decisions, accountPassword, dueDate: dueDate ?? undefined },
    actor
  );
const moveRows = (id: string, rowBranches: Array<{ rowNumber: number; branchId: string | null }>) =>
  CustomerImportService.updateDraft(id, { rowBranches }, actor);
const outstanding = async (customerId: string) =>
  (
    await CustomerFinancialSummaryService.getCustomerFinancialSummary(
      customerId,
      customerFinancialSummaryQuerySchema.parse({ includePayments: 'false' })
    )
  ).summary.totalOutstanding;
const rowsCsv =
  'Name,Phone,Opening balance,Currency\nAli, 03 123 456 ,10,USD\nMaya,70123456,895000,LBP';
const effects = async () => ({
  customers: await db.customer.count({ where: { branchId: a } }),
  debts: await db.debt.count({ where: { branchId: a } }),
  logs: await db.activityLog.count({ where: { branchId: a } }),
});
const checksumB = async () =>
  createHash('sha256')
    .update(
      JSON.stringify({
        customers: await db.customer.findMany({ where: { branchId: b }, orderBy: { id: 'asc' } }),
        debts: await db.debt.findMany({ where: { branchId: b }, orderBy: { id: 'asc' } }),
      })
    )
    .digest('hex');
const customer = (name: string, phone: string, branchId = a) =>
  db.customer.create({ data: { name, phone, branchId, createdBy: owner } });
const http = (method: 'get' | 'patch' | 'post', path: string, body?: object) => {
  const client = request(app);
  return client[method]('/api/v1/customers/imports' + path)
    .set('Authorization', 'Bearer ' + token)
    .send(body);
};

(enabled ? describe : describe.skip)('Phase 5 customer CSV import (§5.3–5.4)', () => {
  beforeAll(() => {
    if (!isIsolatedTestDatabase(process.env.DATABASE_URL))
      throw new Error('An isolated test database is required');
  });
  beforeEach(async () => {
    resetAdminPasswordAttemptsForTests();
    owner = randomUUID();
    a = randomUUID();
    b = randomUUID();
    await db.user.create({
      data: {
        id: owner,
        username: 'csv-' + owner,
        fullName: 'CSV test admin',
        password: await bcrypt.hash(password, 4),
        role: 'ADMIN',
      },
    });
    actor = { userId: owner, role: 'ADMIN' };
    token = jwt.sign(actor, process.env.JWT_SECRET!);
    await db.branch.createMany({
      data: [
        { id: a, code: 'CSV-A-' + a, name: 'CSV A ' + a, createdById: owner },
        { id: b, code: 'CSV-B-' + b, name: 'CSV B ' + b, createdById: owner },
      ],
    });
    await db.exchangeRate.create({
      data: {
        fromCurrency: 'USD',
        toCurrency: 'LBP',
        rate: '89500',
        effectiveFrom: new Date('2020-01-01'),
        createdById: owner,
      },
    });
  });
  afterEach(async () => {
    const branchIds = [a, b];
    await db.activityLog.deleteMany({ where: { userId: owner } });
    await db.adminVerificationLog.deleteMany({ where: { userId: owner } });
    await db.paymentAllocation.deleteMany({ where: { payment: { createdById: owner } } });
    await db.payment.deleteMany({ where: { createdById: owner } });
    await db.installment.deleteMany({ where: { installmentPlan: { createdById: owner } } });
    await db.installmentPlan.deleteMany({ where: { createdById: owner } });
    await db.debt.deleteMany({ where: { branchId: { in: branchIds } } });
    await db.customerImportAccount.deleteMany({ where: { branchId: { in: branchIds } } });
    await db.customerImport.deleteMany({ where: { branchId: { in: branchIds } } });
    await db.customer.deleteMany({ where: { branchId: { in: branchIds } } });
    await db.userBranchAccess.deleteMany({ where: { userId: owner } });
    await db.branch.deleteMany({ where: { id: { in: branchIds } } });
    await db.exchangeRate.deleteMany({ where: { createdById: owner } });
    await db.user.delete({ where: { id: owner } });
  });
  afterAll(async () => {
    await db.$disconnect();
    await prisma.$disconnect();
  });

  it('§5.3 in-file duplicate phone conflicts require selecting one row; existing phone allows UPDATE/SKIP only', async () => {
    const existing = await customer('Original', '03123456');
    const draft = await create('Name,Phone\nAli,03 123 456\nAli Two,03123456');
    expect(draft.rows[0].conflicts.map((item) => item.kind)).toEqual([
      'FILE_PHONE',
      'EXISTING_PHONE',
    ]);
    await expect(commit(draft.id)).rejects.toMatchObject({ code: 'CUSTOMER_IMPORT_UNRESOLVED' });
    await expect(
      commit(draft.id, [
        { rowNumber: 2, action: 'CREATE' },
        { rowNumber: 3, action: 'SKIP' },
      ])
    ).rejects.toMatchObject({ statusCode: 409 });
    const result = await commit(draft.id, [
      { rowNumber: 2, action: 'UPDATE', targetCustomerId: existing.id, updateFields: ['name'] },
      { rowNumber: 3, action: 'SKIP' },
    ]);
    expect(result).toMatchObject({ created: 0, updated: 1, skipped: 1 });
    expect(await db.customer.findUniqueOrThrow({ where: { id: existing.id } })).toMatchObject({
      name: 'Ali',
      phone: '03123456',
    });
  });
  it('§5.3 a customer found only in another branch stays there by default; choosing this branch moves them, with no duplicate', async () => {
    const other = await customer('Other branch', '03123456', b);
    await db.debt.create({
      data: {
        branchId: b,
        customerId: other.id,
        originalAmount: 90,
        baseOriginalAmount: 90,
        dueDate: new Date('2026-10-28'),
        description: 'B historical debt',
        createdById: owner,
      },
    });
    const found = await create('Name,Phone,Opening balance\nAli,03 123 456,90');
    expect(found.rows[0]).toMatchObject({
      branchId: b,
      matchedBy: 'PHONE',
      moveFrom: null,
      matches: [{ id: other.id }],
      balance: { kind: 'NONE' },
    });
    const draft = await moveRows(found.id, [{ rowNumber: 2, branchId: a }]);
    expect(draft.rows[0]).toMatchObject({
      branchId: a,
      matchedBy: 'MOVE',
      moveFrom: { branchId: b },
      decision: { action: 'UPDATE', targetCustomerId: other.id },
      conflicts: [{ kind: 'CUSTOMER_MOVE', blocking: false }],
    });
    // A move needs no password; only money changes ask for one.
    expect(await commit(draft.id)).toMatchObject({ created: 0, updated: 1, moved: 1 });
    expect(await db.customer.count({ where: { branchId: b } })).toBe(0);
    expect(await db.customer.findUniqueOrThrow({ where: { id: other.id } })).toMatchObject({
      branchId: a,
    });
    expect(await db.debt.findFirstOrThrow({ where: { customerId: other.id } })).toMatchObject({
      branchId: a,
    });
    expect(
      await db.activityLog.count({
        where: { entityId: other.id, action: 'CUSTOMER_BRANCH_TRANSFERRED' },
      })
    ).toBe(1);
  });
  it('§5.3 stale matching conflict at commit returns 409 CUSTOMER_IMPORT_STALE and rolls back every row', async () => {
    const draft = await create('Name,Phone\nFirst,70111111\nSecond,70222222');
    await customer('Concurrent customer', '70 222 222');
    const before = await effects();
    const response = await http('post', '/' + draft.id + '/commit', { decisions: [] });
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('CUSTOMER_IMPORT_STALE');
    expect(await effects()).toEqual(before);
    expect(await db.customerImport.findUniqueOrThrow({ where: { id: draft.id } })).toMatchObject({
      status: 'DRAFT',
    });
  });
  it('§5.4 same draft committed twice returns its stored result and creates one set of effects', async () => {
    const draft = await create(rowsCsv);
    const first = await commit(draft.id, [], password);
    const before = await effects();
    expect(await commit(draft.id)).toEqual(first);
    expect(await effects()).toEqual(before);
    expect(first).toMatchObject({ created: 2, openingDebts: 2, openingDebtTotalUsd: '20.00' });
  });
  it('§5.4 concurrent commits of one draft produce a single set of effects', async () => {
    const draft = await create('Name,Phone,Opening balance\nAli,03123456,10');
    const results = await Promise.all([
      commit(draft.id, [], password),
      commit(draft.id, [], password),
    ]);
    expect(results[0]).toEqual(results[1]);
    expect(await effects()).toMatchObject({ customers: 1, debts: 1 });
  });
  it('§5.4 re-uploading the same file to the same branch defaults every matching row to SKIP with zero new customers or debts', async () => {
    const first = await create(rowsCsv);
    await commit(first.id, [], password);
    const draft = await create(rowsCsv);
    expect(draft.previousCommittedImport?.id).toBe(first.id);
    expect(draft.rows.map((row) => row.decision.action)).toEqual(['SKIP', 'SKIP']);
    const before = await effects();
    expect(await commit(draft.id)).toMatchObject({ created: 0, openingDebts: 0, skipped: 2 });
    expect(await effects()).toEqual(before);
  });
  it('§5.4 skipping a changed balance updates contact fields without touching money', async () => {
    const first = await create('Name,Phone,Opening balance\nAli,03123456,10');
    await commit(first.id, [], password);
    const draft = await create('Name,Phone,Opening balance\nAli Edited,03 123 456,25');
    expect(draft.rows[0].balance).toMatchObject({ kind: 'INCREASE', difference: '15.00' });
    expect(
      await commit(draft.id, [{ ...draft.rows[0].decision, skipOpeningBalance: true }])
    ).toMatchObject({ updated: 1, openingDebts: 0, balanceIncreases: 0 });
    expect(await db.debt.count({ where: { branchId: a } })).toBe(1);
    expect(await db.customer.findFirstOrThrow({ where: { branchId: a } })).toMatchObject({
      name: 'Ali Edited',
      phone: '03123456',
    });
  });
  it('§5.4 the same file into a different branch finds the same customers and creates no duplicates', async () => {
    const first = await create(rowsCsv);
    await commit(first.id, [], password);
    const second = await create(rowsCsv, b);
    expect(second.rows.map((row) => row.branchId)).toEqual([a, a]);
    expect(await commit(second.id)).toMatchObject({ created: 0, openingDebts: 0 });
    expect(await db.customer.count({ where: { branchId: a } })).toBe(2);
    expect(await db.customer.count({ where: { branchId: b } })).toBe(0);
  });
  it('§5.4 access revoked between preview and get/patch/commit returns 404 and writes nothing', async () => {
    const draft = await create('Name,Phone,Opening balance\nAli,03123456,10');
    // ADMIN access is implicit. Demotion with no grants revokes this destination,
    // including requests carrying an earlier ADMIN token.
    await db.user.update({ where: { id: owner }, data: { role: 'EMPLOYEE' } });
    const before = await effects();
    for (const [method, suffix, body] of [
      ['get', '', undefined],
      ['patch', '', { decisions: [] }],
      ['post', '/commit', { decisions: [], accountPassword: password }],
    ] as const) {
      expect((await http(method, '/' + draft.id + suffix, body)).status).toBe(404);
    }
    expect(await effects()).toEqual(before);
  });
  it('inactive destination returns 409 on create, get, patch and commit and writes nothing', async () => {
    const draft = await create('Name,Phone\nAli,03123456');
    await db.branch.update({ where: { id: a }, data: { isActive: false } });
    const before = await effects();
    await expect(create('Name,Phone\nAli,03123456')).rejects.toMatchObject({ statusCode: 409 });
    for (const [method, suffix, body] of [
      ['get', '', undefined],
      ['patch', '', { decisions: [] }],
      ['post', '/commit', { decisions: [] }],
    ] as const) {
      expect((await http(method, '/' + draft.id + suffix, body)).status).toBe(409);
    }
    expect(await effects()).toEqual(before);
  });
  it('USD and LBP opening debts use the current rate, source link, branch and DEBT_CREATED audit; derived balances equal imported USD amounts', async () => {
    const draft = await create(rowsCsv);
    await expect(commit(draft.id)).rejects.toMatchObject({ statusCode: 400 });
    await expect(commit(draft.id, [], 'wrong-password')).rejects.toMatchObject({ statusCode: 401 });
    expect(await effects()).toMatchObject({ customers: 0, debts: 0, logs: 0 });
    await commit(draft.id, [], password);
    const debts = await db.debt.findMany({ where: { branchId: a }, orderBy: { currency: 'desc' } });
    expect(debts).toHaveLength(2);
    for (const debt of debts) {
      expect(debt.branchId).toBe(a);
      expect(debt.sourceCustomerImportId).toBe(draft.id);
      expect(debt.kind).toBe('STANDARD');
      expect(debt.baseOriginalAmount.toFixed(2)).toBe('10.00');
      expect(debt.exchangeRate.toFixed(6)).toBe(
        debt.currency === 'USD' ? '1.000000' : '89500.000000'
      );
      expect(
        await db.activityLog.findFirst({
          where: { entityId: debt.id, branchId: a, action: 'DEBT_CREATED' },
        })
      ).not.toBeNull();
      const summary = await CustomerFinancialSummaryService.getCustomerFinancialSummary(
        debt.customerId,
        customerFinancialSummaryQuerySchema.parse({ includePayments: 'false' })
      );
      expect(summary.summary.totalOutstanding).toBe('10.00');
    }
    expect(
      await db.adminVerificationLog.count({
        where: { userId: owner, action: 'COMMIT_CUSTOMER_CSV_IMPORT', outcome: 'SUCCESS' },
      })
    ).toBe(1);
  });
  it('new imported debt after preview is stale and atomic even across different drafts', async () => {
    const target = await customer('Ali', '03123456');
    const older = await create('Name,Phone,Opening balance\nAli,03123456,10');
    const newer = await create('Name,Phone,Opening balance\nAli Changed,03123456,20');
    await commit(older.id, [], password);
    const before = await effects();
    await expect(
      commit(
        newer.id,
        [{ rowNumber: 2, action: 'UPDATE', targetCustomerId: target.id, updateFields: ['name'] }],
        password
      )
    ).rejects.toMatchObject({ code: 'CUSTOMER_IMPORT_STALE' });
    expect(await effects()).toEqual(before);
  });
  it('mapping and decisions persist, invalid rows produce a downloadable report and import branch cannot be patched', async () => {
    const draft = await create('Contact,Telephone\nAli,03123456\nBad,abcde');
    const response = await http('patch', '/' + draft.id, { columnMapping: { name: 0, phone: 1 } });
    expect(response.status).toBe(200);
    expect(response.body.data.rows[1].status).toBe('INVALID');
    expect((await http('patch', '/' + draft.id, { branchId: b })).status).toBe(400);
    const saved = await CustomerImportService.updateDraft(
      draft.id,
      { decisions: [{ rowNumber: 3, action: 'SKIP' }] },
      actor
    );
    expect((await CustomerImportService.getDraft(draft.id, actor)).rows[1].decision.action).toBe(
      'SKIP'
    );
    const result = await commit(saved.id);
    expect(result).toMatchObject({ created: 1, skipped: 1, invalid: 1 });
    expect((result as { reportCsv: string }).reportCsv).toContain('Phone must contain digits');
  });
  it('uses canonical database UUIDs for an explicitly chosen uppercase branch ID', async () => {
    const response = await http('post', '', {
      branchId: a.toUpperCase(),
      fileName: 'uppercase.csv',
      csvText: 'Name,Phone\nAli,03123456',
    });
    expect(response.status).toBe(201);
    expect(response.body.data.branchId).toBe(a);
    expect(await commit(response.body.data.id)).toMatchObject({ created: 1 });
  });

  it('accepts a full 2000-row import in one bounded transaction', async () => {
    const csv =
      'Name,Phone\n' +
      Array.from(
        { length: 2000 },
        (_, i) => 'Customer ' + i + ',79' + String(i).padStart(6, '0')
      ).join('\n');
    const draft = await create(csv);
    expect(await commit(draft.id)).toMatchObject({ created: 2000, openingDebts: 0 });
    expect(await db.customer.count({ where: { branchId: a } })).toBe(2000);
  }, 180000);

  it('imports trial-balance accounts without fake phones, with exact Balance Debit and durable repeat protection', async () => {
    const report =
      'Trial Balance,By Date,Account,Name,Curr,Total Debit,Total Credit,Balance Debit,Balance Credit,0411000099,زبون تجريبي,USD,865,420,445,0,0411000100,Second Customer,USD,0,0,0,0,Debit,Credit,Balance,Totals :,865,420,445';
    const draft = await create(report);
    expect(draft.rows).toHaveLength(2);
    expect(draft.rows.every((row) => row.status === 'READY')).toBe(true);
    await expect(commit(draft.id)).rejects.toMatchObject({ statusCode: 400 });
    expect(await db.customerImportAccount.count({ where: { branchId: a } })).toBe(0);
    expect(await commit(draft.id, [], password)).toMatchObject({
      created: 2,
      openingDebts: 1,
      openingDebtTotalUsd: '445.00',
    });
    const accounts = await db.customerImportAccount.findMany({
      where: { branchId: a },
      include: { customer: true },
      orderBy: { accountCode: 'asc' },
    });
    expect(accounts).toHaveLength(2);
    expect(accounts.every((account) => account.customer.phone === '')).toBe(true);
    const debt = await db.debt.findFirstOrThrow({ where: { branchId: a } });
    expect(debt.originalAmount.toFixed(2)).toBe('445.00');
    expect(debt.customerId).toBe(accounts[0].customerId);
    const repeat = await create(report.replace('865,420,445,0', '900,455,445,0'));
    expect(repeat.rows[0].matches[0].id).toBe(accounts[0].customerId);
    expect(repeat.rows[0].balance).toMatchObject({ kind: 'NONE', current: '445.00' });
    await commit(repeat.id);
    expect(await db.customer.count({ where: { branchId: a } })).toBe(2);
    expect(await db.debt.count({ where: { branchId: a } })).toBe(1);
    const otherDraft = await create(report, b);
    expect(otherDraft.rows.map((row) => row.branchId)).toEqual([a, a]);
    const other = await moveRows(otherDraft.id, [
      { rowNumber: 2, branchId: b },
      { rowNumber: 3, branchId: b },
    ]);
    expect(other.rows[0]).toMatchObject({ matchedBy: 'MOVE', moveFrom: { branchId: a } });
    expect(await commit(other.id)).toMatchObject({ created: 0, moved: 2 });
    expect(await db.customerImportAccount.count({ where: { branchId: b } })).toBe(2);
    expect(await db.customerImportAccount.count({ where: { branchId: a } })).toBe(0);
    // A mapping cannot point to a customer in another branch, even through raw ORM writes.
    const inA = await customer('Still in A', '70999999', a);
    await expect(
      db.customerImportAccount.create({
        data: {
          branchId: b,
          accountCode: '9999',
          customerId: inA.id,
          sourceCustomerImportId: other.id,
          createdById: owner,
        },
      })
    ).rejects.toMatchObject({ code: 'P2003' });
  });

  it('blocks duplicate accounts, ambiguous identities, and concurrently assigned accounts atomically', async () => {
    const duplicates = await create('Name,Account\nFirst,1234\nSecond,1234');
    expect(duplicates.rows[0].conflicts[0].kind).toBe('FILE_ACCOUNT');
    await expect(commit(duplicates.id)).rejects.toMatchObject({
      code: 'CUSTOMER_IMPORT_UNRESOLVED',
    });
    const first = await create('Name,Account,Phone\nFirst,1234,03123456');
    const concurrent = await create('Name,Account\nSecond,1234');
    await commit(first.id);
    await expect(commit(concurrent.id)).rejects.toMatchObject({ code: 'CUSTOMER_IMPORT_STALE' });
    const second = await customer('Phone Owner', '70123456');
    const mismatch = await create('Name,Account,Phone\nMismatch,1234,70123456');
    expect(mismatch.rows[0].matches).toHaveLength(2);
    expect(mismatch.rows[0].decision.action).toBe('SKIP');
    await expect(
      commit(mismatch.id, [{ rowNumber: 2, action: 'UPDATE', targetCustomerId: second.id }])
    ).rejects.toMatchObject({ code: 'CUSTOMER_IMPORT_UNRESOLVED' });
    expect(await db.customer.count({ where: { branchId: a } })).toBe(2);
  });

  it('binds a new account to its sole phone match without replacing contact information', async () => {
    const existing = await customer('Phone Owner', '03 123 456');
    const draft = await create('Name,Account,Phone\nImported Name,000123,03123456');
    expect(draft.rows[0].decision.action).toBe('UPDATE');
    await commit(draft.id);
    expect(
      await db.customerImportAccount.findUniqueOrThrow({
        where: { branchId_accountCode: { branchId: a, accountCode: '000123' } },
      })
    ).toMatchObject({ customerId: existing.id });
    expect(await db.customer.findUniqueOrThrow({ where: { id: existing.id } })).toMatchObject({
      phone: '03 123 456',
    });
    const accountOnly = await create('Name,Account\nUpdated Name,000123');
    expect(accountOnly.rows[0].matches[0].id).toBe(existing.id);
  });

  it('concurrent account commits produce one customer and archived accounts cannot be recreated', async () => {
    const first = await create('Name,Account\nFirst,000777');
    const second = await create('Name,Account\nSecond,000777');
    const results = await Promise.allSettled([commit(first.id), commit(second.id)]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(await db.customer.count({ where: { branchId: a } })).toBe(1);
    const binding = await db.customerImportAccount.findUniqueOrThrow({
      where: { branchId_accountCode: { branchId: a, accountCode: '000777' } },
    });
    await db.customer.update({
      where: { id: binding.customerId },
      data: { deletedAt: new Date() },
    });
    const archived = await create('Name,Account\nThird,000777');
    expect(archived.rows[0].status).toBe('INVALID');
    expect(archived.rows[0].issues.join()).toContain('archived customer');
    await expect(commit(archived.id, [{ rowNumber: 2, action: 'CREATE' }])).rejects.toMatchObject({
      code: 'CUSTOMER_IMPORT_UNRESOLVED',
    });
    const wrongBranchSource = await create('Name,Account\nOther,12345', b);
    await expect(
      db.customerImportAccount.create({
        data: {
          branchId: a,
          accountCode: '8888',
          customerId: binding.customerId,
          sourceCustomerImportId: wrongBranchSource.id,
          createdById: owner,
        },
      })
    ).rejects.toMatchObject({ code: 'P2003' });
  });

  describe('balance changes on re-import', () => {
    const imported = async (balance: string) => {
      const first = await create('Name,Phone,Opening balance\nAli,03123456,' + balance);
      await commit(first.id, [], password);
      return (await db.customer.findFirstOrThrow({ where: { branchId: a } })).id;
    };
    const fileSaying = (balance: string) =>
      create('Name,Phone,Opening balance\nAli,03123456,' + balance);

    it('a lower balance records an OTHER payment on the import date and the profile agrees', async () => {
      const id = await imported('200');
      const draft = await fileSaying('100');
      expect(draft.rows[0].balance).toEqual({
        kind: 'DECREASE',
        current: '200.00',
        file: '100.00',
        difference: '-100.00',
      });
      expect(draft.planned).toMatchObject({
        balancePayments: 1,
        balancePaymentTotalUsd: '100.00',
        dueDateRequired: false,
      });
      await expect(commit(draft.id)).rejects.toMatchObject({ statusCode: 400 });
      expect(await commit(draft.id, [], password, null)).toMatchObject({
        updated: 1,
        balancePayments: 1,
        balancePaymentTotalUsd: '100.00',
      });
      expect(await outstanding(id)).toBe('100.00');
      const payment = await db.payment.findFirstOrThrow({ where: { customerId: id } });
      expect(payment).toMatchObject({
        branchId: a,
        paymentMethod: 'OTHER',
        reference: 'Import customers.csv',
      });
      expect(payment.totalAmount.toFixed(2)).toBe('100.00');
      expect(payment.idempotencyKey).toContain('customer-import:' + draft.id);
      // The opening debt stays as imported; the drop exists only as a printable receipt.
      const opening = await db.debt.findFirstOrThrow({ where: { customerId: id } });
      expect(opening.originalAmount.toFixed(2)).toBe('200.00');
      expect(await db.debt.count({ where: { customerId: id } })).toBe(1);
      const receipt = await request(app)
        .get('/api/v1/payments/' + payment.id + '/receipt')
        .set('Authorization', 'Bearer ' + token);
      expect(receipt.status).toBe(200);
      expect(
        await db.activityLog.count({
          where: { entityId: id, action: 'CUSTOMER_IMPORT_BALANCE_PAYMENT' },
        })
      ).toBe(1);
    });
    it('an explicit 0 pays everything; a blank cell or unmapped column changes nothing', async () => {
      const id = await imported('200');
      const blank = await fileSaying('');
      expect(blank.rows[0].balance.kind).toBe('NO_INFO');
      await commit(blank.id);
      const unmapped = await create('Name,Phone\nAli,03123456');
      expect(unmapped.rows[0].balance.kind).toBe('NO_INFO');
      await commit(unmapped.id);
      expect(await outstanding(id)).toBe('200.00');
      const zero = await fileSaying('0');
      await commit(zero.id, [], password);
      expect(await outstanding(id)).toBe('0.00');
      expect((await db.debt.findFirstOrThrow({ where: { customerId: id } })).status).toBe('PAID');
    });
    it('a higher balance adds a debt for the difference only, due on the chosen date', async () => {
      const id = await imported('200');
      const draft = await fileSaying('260');
      expect(draft.planned).toMatchObject({ balanceIncreases: 1, dueDateRequired: true });
      await expect(commit(draft.id, [], password, null)).rejects.toMatchObject({
        statusCode: 400,
      });
      expect(await commit(draft.id, [], password, '2027-01-15')).toMatchObject({
        balanceIncreases: 1,
        balanceIncreaseTotalUsd: '60.00',
        openingDebts: 0,
      });
      expect(await outstanding(id)).toBe('260.00');
      const debt = await db.debt.findFirstOrThrow({
        where: { customerId: id, description: { startsWith: 'Balance increase' } },
      });
      expect(debt.originalAmount.toFixed(2)).toBe('60.00');
      expect(debt.dueDate.toISOString().slice(0, 10)).toBe('2027-01-15');
      expect(debt.sourceCustomerImportId).toBe(draft.id);
    });
    it('a due date in the file wins, and no date is asked for when every row has one', async () => {
      const draft = await create('Name,Phone,Opening balance,Due date\nAli,03123456,10,2027-03-01');
      expect(draft.planned.dueDateRequired).toBe(false);
      await commit(draft.id, [], password, null);
      const debt = await db.debt.findFirstOrThrow({ where: { branchId: a } });
      expect(debt.dueDate.toISOString().slice(0, 10)).toBe('2027-03-01');
    });
    it('another currency is flagged and changes no money, even alongside the file currency', async () => {
      const id = await imported('200');
      await db.debt.create({
        data: {
          branchId: a,
          customerId: id,
          originalAmount: 895000,
          currency: 'LBP',
          exchangeRate: 89500,
          baseOriginalAmount: 10,
          dueDate: new Date('2026-10-28'),
          description: 'LBP debt',
          createdById: owner,
        },
      });
      const draft = await fileSaying('100');
      expect(draft.rows[0].balance.kind).toBe('CURRENCY_MISMATCH');
      expect(draft.rows[0].conflicts.map((item) => item.kind)).toContain('BALANCE_CURRENCY');
      await commit(draft.id);
      expect(await db.payment.count({ where: { customerId: id } })).toBe(0);
    });
    it('an older file after a HomeConnect payment defaults to no money change but can be applied', async () => {
      const id = await imported('200');
      const debt = await db.debt.findFirstOrThrow({ where: { customerId: id } });
      await DebtsService.recordDebtPayment(
        debt.id,
        { amount: '50', currency: 'USD', paymentDate: '2026-10-29', paymentMethod: 'CASH' },
        actor as never,
        { mode: 'single', branchIds: [a] }
      );
      const editedFile = (note: string) =>
        create('Name,Phone,Opening balance,Notes\nAli,03123456,200,' + note);
      const draft = await editedFile('first');
      expect(draft.rows[0].balance).toMatchObject({ kind: 'INCREASE', difference: '50.00' });
      expect(draft.rows[0].decision.skipOpeningBalance).toBe(true);
      expect(draft.rows[0].conflicts.map((item) => item.kind)).toContain('BALANCE_ACTIVITY');
      expect(draft.planned.balanceIncreases).toBe(0);
      await commit(draft.id);
      expect(await outstanding(id)).toBe('150.00');
      const again = await editedFile('second');
      await commit(
        again.id,
        [{ ...again.rows[0].decision, skipOpeningBalance: false }],
        password
      );
      expect(await outstanding(id)).toBe('200.00');
    });
    it('a lower balance pays oldest first across a debt and an installment plan, with exact totals', async () => {
      const id = (await customer('Ali', '03123456')).id;
      await db.debt.create({
        data: {
          branchId: a,
          customerId: id,
          originalAmount: 40,
          baseOriginalAmount: 40,
          dueDate: new Date('2026-05-01'),
          description: 'Newer debt',
          createdById: owner,
        },
      });
      const plan = await db.installmentPlan.create({
        data: {
          branchId: a,
          customerId: id,
          description: 'Plan',
          totalAmount: 60,
          baseTotalAmount: 60,
          startDate: new Date('2026-01-01'),
          installmentCount: 2,
          createdById: owner,
          installments: {
            create: [
              { installmentNumber: 1, dueDate: new Date('2026-01-01'), amountDue: 30, baseAmountDue: 30 },
              { installmentNumber: 2, dueDate: new Date('2026-08-01'), amountDue: 30, baseAmountDue: 30 },
            ],
          },
        },
      });
      const draft = await fileSaying('25');
      expect(draft.rows[0].balance).toMatchObject({ current: '100.00', difference: '-75.00' });
      await commit(draft.id, [], password);
      expect(await outstanding(id)).toBe('25.00');
      const payments = await db.payment.findMany({
        where: { customerId: id },
        include: { allocations: true },
        orderBy: { totalAmount: 'desc' },
      });
      expect(payments.map((payment) => payment.totalAmount.toFixed(2))).toEqual(['60.00', '15.00']);
      expect(payments[0].allocations.every((item) => item.installmentId)).toBe(true);
      expect(payments[1].allocations[0].debtId).not.toBeNull();
      expect((await db.installmentPlan.findUniqueOrThrow({ where: { id: plan.id } })).status).toBe(
        'COMPLETED'
      );
    });
    it('a balance changing between preview and commit is stale and writes nothing', async () => {
      const id = await imported('200');
      const draft = await fileSaying('100');
      const debt = await db.debt.findFirstOrThrow({ where: { customerId: id } });
      await DebtsService.recordDebtPayment(
        debt.id,
        { amount: '10', currency: 'USD', paymentDate: '2026-10-29', paymentMethod: 'CASH' },
        actor as never,
        { mode: 'single', branchIds: [a] }
      );
      await expect(commit(draft.id, [], password)).rejects.toMatchObject({
        code: 'CUSTOMER_IMPORT_STALE',
      });
      expect(await outstanding(id)).toBe('190.00');
    });
  });

  describe('branch per customer', () => {
    const branchCode = (id: string) => (id === a ? 'CSV-A-' + a : 'CSV-B-' + b);

    it('reads a Branch column by code or name; an unknown value makes the row invalid', async () => {
      const draft = await create(
        'Name,Phone,Branch\nFirst,70111111,' +
          branchCode(b) +
          '\nSecond,70222222,csv a ' +
          a +
          '\nThird,70333333,Nowhere'
      );
      expect(draft.rows.map((row) => row.branchId)).toEqual([b, a, a]);
      expect(draft.rows[2].issues.join()).toContain('Branch "Nowhere" was not found');
      expect(draft.rows[2].decision.action).toBe('SKIP');
    });
    it('commits a mixed file into each branch with one import record per branch, and a retry changes nothing', async () => {
      const draft = await create(
        'Name,Account,Opening balance,Branch\nFirst,1001,10,' +
          branchCode(a) +
          '\nSecond,1002,20,' +
          branchCode(b)
      );
      const result = (await commit(draft.id, [], password)) as { childImportIds: string[] };
      expect(result).toMatchObject({ created: 2, openingDebts: 2, openingDebtTotalUsd: '30.00' });
      expect(result.childImportIds).toHaveLength(1);
      const accountB = await db.customerImportAccount.findFirstOrThrow({ where: { branchId: b } });
      expect(accountB.sourceCustomerImportId).toBe(result.childImportIds[0]);
      expect(await db.customerImport.findUniqueOrThrow({ where: { id: accountB.sourceCustomerImportId } })).toMatchObject({
        status: 'COMMITTED',
        branchId: b,
      });
      expect(await db.debt.count({ where: { branchId: b } })).toBe(1);
      expect(await db.debt.count({ where: { branchId: a } })).toBe(1);
      const before = await db.customerImport.count({ where: { branchId: { in: [a, b] } } });
      expect(await commit(draft.id, [], password)).toEqual(result);
      expect(await db.customerImport.count({ where: { branchId: { in: [a, b] } } })).toBe(before);
    });
    it('the same phone may be used once per branch in one file', async () => {
      const draft = await create(
        'Name,Phone,Branch\nHere,70111111,' + branchCode(a) + '\nThere,70111111,' + branchCode(b)
      );
      expect(draft.rows.every((row) => row.status === 'READY')).toBe(true);
      expect(await commit(draft.id)).toMatchObject({ created: 2 });
    });
    it('moving every row away from the default branch still commits, into the chosen branch', async () => {
      const draft = await create('Name,Phone\nFirst,70111111\nSecond,70222222');
      await moveRows(draft.id, [
        { rowNumber: 2, branchId: b },
        { rowNumber: 3, branchId: b },
      ]);
      expect(await commit(draft.id)).toMatchObject({ created: 2 });
      expect(await db.customer.count({ where: { branchId: a } })).toBe(0);
      expect(await db.customer.count({ where: { branchId: b } })).toBe(2);
    });
    it('choosing another branch moves the customer, and a null choice returns the row to their own branch', async () => {
      const here = await customer('Ali', '03123456');
      const draft = await create('Name,Phone\nAli,03123456');
      expect(draft.rows[0].decision).toMatchObject({ action: 'UPDATE', targetCustomerId: here.id });
      const moved = await moveRows(draft.id, [{ rowNumber: 2, branchId: b }]);
      expect(moved.rows[0]).toMatchObject({ chosenBranch: true, moveFrom: { branchId: a } });
      expect(moved.planned.moved).toBe(1);
      const back = await moveRows(draft.id, [{ rowNumber: 2, branchId: null }]);
      expect(back.rows[0]).toMatchObject({ branchId: a, chosenBranch: false, moveFrom: null });
      await moveRows(draft.id, [{ rowNumber: 2, branchId: b }]);
      expect(await commit(draft.id)).toMatchObject({ created: 0, moved: 1 });
      expect(await db.customer.count({ where: { branchId: a } })).toBe(0);
      expect(await db.customer.count({ where: { branchId: b } })).toBe(1);
    });
    it('a same-name customer with no phone or account in the file is found in their own branch, never duplicated', async () => {
      const main = await customer('Najla Khatib', '71194334', a);
      const draft = await create('Name,Account,Opening balance\n  najla khatib ,41100,250', b);
      expect(draft.rows[0]).toMatchObject({
        branchId: a,
        matchedBy: 'NAME',
        matches: [{ id: main.id }],
        decision: { action: 'UPDATE', targetCustomerId: main.id },
      });
      expect(await commit(draft.id, [], password)).toMatchObject({ created: 0, updated: 1 });
      expect(await db.customer.findUniqueOrThrow({ where: { id: main.id } })).toMatchObject({
        name: 'Najla Khatib',
      });
      expect(await db.customer.count({ where: { branchId: { in: [a, b] } } })).toBe(1);
      expect(
        await db.customerImportAccount.findFirstOrThrow({ where: { accountCode: '41100' } })
      ).toMatchObject({ branchId: a, customerId: main.id });
      expect(await db.debt.findFirstOrThrow({ where: { customerId: main.id } })).toMatchObject({
        branchId: a,
      });
    });
    it('a same name with a different phone or its own account is a different person; adding as new is allowed', async () => {
      const main = await customer('Najla Khatib', '71194334', a);
      const otherPhone = await create('Name,Phone\nNajla Khatib,70111222');
      expect(otherPhone.rows[0].matches).toEqual([]);
      expect(otherPhone.rows[0].conflicts.map((item) => item.kind)).toContain('NAME_SIMILAR');
      const same = await create('Name,Account\nNajla Khatib,41100');
      expect(same.rows[0].matchedBy).toBe('NAME');
      expect(await commit(same.id, [{ rowNumber: 2, action: 'CREATE' }])).toMatchObject({
        created: 1,
      });
      expect(await db.customer.count({ where: { name: 'Najla Khatib' } })).toBe(2);
      const third = await create('Name,Account\nNajla Khatib,41101');
      expect(third.rows[0].matches.map((item) => item.id)).toEqual([main.id]);
    });
    it('a same name already in several branches is a choice, not a new customer', async () => {
      await customer('Najla Khatib', '', a);
      await customer('Najla Khatib', '', b);
      const third = randomUUID();
      await db.branch.create({
        data: { id: third, code: 'CSV-C-' + third, name: 'CSV C ' + third, createdById: owner },
      });
      const draft = await create('Name,Account\nNajla Khatib,41100', third);
      expect(draft.rows[0].conflicts.map((item) => item.kind)).toContain('BRANCH_AMBIGUOUS');
      expect(draft.rows[0].decision.action).toBe('SKIP');
      await db.customerImport.delete({ where: { id: draft.id } });
      await db.branch.delete({ where: { id: third } });
    });
    it('a customer found in several branches, none the default, must get a chosen branch', async () => {
      await customer('Ali A', '03123456', a);
      await customer('Ali B', '03123456', b);
      const third = randomUUID();
      await db.branch.create({
        data: { id: third, code: 'CSV-C-' + third, name: 'CSV C ' + third, createdById: owner },
      });
      const draft = await create('Name,Phone\nAli,03123456', third);
      expect(draft.rows[0].conflicts.map((item) => item.kind)).toContain('BRANCH_AMBIGUOUS');
      expect(draft.rows[0].decision.action).toBe('SKIP');
      await expect(
        commit(draft.id, [{ rowNumber: 2, action: 'CREATE' }])
      ).rejects.toMatchObject({ code: 'CUSTOMER_IMPORT_UNRESOLVED' });
      const chosen = await moveRows(draft.id, [{ rowNumber: 2, branchId: a }]);
      expect(chosen.rows[0].conflicts.map((item) => item.kind)).not.toContain('BRANCH_AMBIGUOUS');
      await db.customerImport.delete({ where: { id: draft.id } });
      await db.branch.delete({ where: { id: third } });
    });
    it('rejects a row number outside the file and a branch that is inactive', async () => {
      const draft = await create('Name,Phone\nAli,03123456');
      await expect(moveRows(draft.id, [{ rowNumber: 9, branchId: b }])).rejects.toMatchObject({
        statusCode: 400,
      });
      await db.branch.update({ where: { id: b }, data: { isActive: false } });
      await expect(moveRows(draft.id, [{ rowNumber: 2, branchId: b }])).rejects.toMatchObject({
        statusCode: 409,
      });
    });
  });

  it('all endpoints are ADMIN-only even when the employee has branch access; unknown decision rows are rejected', async () => {
    const draft = await create('Name,Phone\nAli,03123456');
    await expect(commit(draft.id, [{ rowNumber: 999, action: 'SKIP' }])).rejects.toMatchObject({
      statusCode: 400,
    });
    await db.user.update({ where: { id: owner }, data: { role: 'EMPLOYEE' } });
    await db.userBranchAccess.create({ data: { userId: owner, branchId: a, grantedById: owner } });
    for (const [method, path, body] of [
      ['post', '', { branchId: a, fileName: 'x.csv', csvText: 'Name,Phone\nAli,03123456' }],
      ['get', '/' + draft.id, undefined],
      ['patch', '/' + draft.id, { decisions: [] }],
      ['post', '/' + draft.id + '/commit', { decisions: [] }],
    ] as const)
      expect((await http(method, path, body)).status).toBe(403);
    expect(await effects()).toMatchObject({ customers: 0, debts: 0 });
  });
});
