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
const commit = (id: string, decisions: CustomerImportDecision[] = [], accountPassword?: string) =>
  CustomerImportService.commit(id, { decisions, accountPassword }, actor);
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
    await db.debt.deleteMany({ where: { branchId: { in: branchIds } } });
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
  it('§5.3 same-digits phone in another branch is only a hint; A import leaves every B customer and debt checksum unchanged', async () => {
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
    const before = await checksumB();
    const draft = await create('Name,Phone,Opening balance\nAli,03 123 456,10');
    expect(draft.rows[0]).toMatchObject({
      status: 'READY',
      matches: [],
      conflicts: [{ kind: 'OTHER_BRANCH_PHONE', blocking: false }],
    });
    await expect(
      commit(
        draft.id,
        [{ rowNumber: 2, action: 'UPDATE', targetCustomerId: other.id, updateFields: ['name'] }],
        password
      )
    ).rejects.toMatchObject({ statusCode: 409 });
    await commit(draft.id, [], password);
    expect(await checksumB()).toBe(before);
    expect(await db.customer.findFirstOrThrow({ where: { branchId: a } })).toMatchObject({
      phone: '03 123 456',
    });
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
  it('§5.4 edited file opening balances for already-imported customers are blocked; skip-opening updates contact fields without a second debt', async () => {
    const first = await create('Name,Phone,Opening balance\nAli,03123456,10');
    await commit(first.id, [], password);
    const draft = await create('Name,Phone,Opening balance\nAli Edited,03 123 456,25');
    expect(draft.rows[0].conflicts.some((item) => item.kind === 'OPENING_DEBT')).toBe(true);
    const before = await effects();
    await expect(commit(draft.id, [], password)).rejects.toMatchObject({
      statusCode: 409,
      code: 'CUSTOMER_IMPORT_UNRESOLVED',
    });
    expect(await effects()).toEqual(before);
    expect(
      await commit(draft.id, [{ ...draft.rows[0].decision, skipOpeningBalance: true }])
    ).toMatchObject({ updated: 1, openingDebts: 0 });
    expect(await db.debt.count({ where: { branchId: a } })).toBe(1);
    expect(await db.customer.findFirstOrThrow({ where: { branchId: a } })).toMatchObject({
      name: 'Ali Edited',
      phone: '03123456',
    });
  });
  it('§5.4 the same file into a different branch creates per-branch customers and shows OTHER_BRANCH_PHONE', async () => {
    const first = await create(rowsCsv);
    await commit(first.id, [], password);
    const second = await create(rowsCsv, b);
    expect(second.previousCommittedImport).toBeNull();
    expect(
      second.rows.every(
        (row) =>
          row.matches.length === 0 &&
          row.conflicts.some((item) => item.kind === 'OTHER_BRANCH_PHONE')
      )
    ).toBe(true);
    expect(await commit(second.id, [], password)).toMatchObject({ created: 2, openingDebts: 2 });
    expect(await db.customer.count({ where: { branchId: a } })).toBe(2);
    expect(await db.customer.count({ where: { branchId: b } })).toBe(2);
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
