import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { isIsolatedTestDatabase } from '../src/test/database';
import { insertMigrationRow, seedOwnershipHistory } from '../src/test/branch-migration-fixture';
import { MigrationExecutor, type MigrationClient } from '../src/features/maintenance/migration-executor';
import { MigrationRunner } from '../src/features/maintenance/migration-runner';

import { SalesOrdersRepository } from '../src/features/sales/sales-orders/sales-orders.repository';
import { SupplierReceivingsRepository } from '../src/features/inventory/receiving/supplier-receivings.repository';
import { SalesOrdersService } from '../src/features/sales/sales-orders/sales-orders.service';
import * as transactions from '../src/features/financial/infrastructure/transaction';

const enabled =
  process.env.RUN_FINANCIAL_DB_TESTS === '1' && isIsolatedTestDatabase(process.env.DATABASE_URL);
const migration = readFileSync(
  'backend/prisma/migrations/20261027120000_add_branch_ownership/migration.sql',
  'utf8'
);
const tables = [
  'customers',
  'suppliers',
  'sales_orders',
  'debts',
  'installment_plans',
  'payments',
  'sales_returns',
  'cash_refunds',
  'customer_credits',
  'supplier_transactions',
  'supplier_receivings',
  'service_jobs',
];

describe.runIf(enabled)('ownership migration on an isolated pre-Phase-2 database', () => {
  let admin: PrismaClient, db: PrismaClient, name: string;
  beforeAll(async () => {
    const base = new URL(process.env.DATABASE_URL!);
    if (!isIsolatedTestDatabase(base.toString()) || base.pathname === '/homeconnect')
      throw Error('Unsafe source');
    name = 'homeconnect_test_mb_' + randomUUID().replaceAll('-', '');
    const adminUrl = new URL(base);
    adminUrl.pathname = '/postgres';
    console.log('Confirmed provisioning target ' + name + '; administrative connection postgres');
    admin = new PrismaClient({ datasources: { db: { url: adminUrl.toString() } } });
    await admin.$executeRawUnsafe('CREATE DATABASE "' + name + '"');
    base.pathname = '/' + name;
    if (!isIsolatedTestDatabase(base.toString())) throw Error('Unsafe test target');
    console.log('Confirmed migration test database ' + name);
    db = new PrismaClient({
      datasources: { db: { url: base.toString() } },
      transactionOptions: { timeout: 120000 },
    });
    const bundled = MigrationRunner.readBundled('backend/prisma/migrations').filter(
      (m) => !m.name.includes('add_branch_ownership')
    );
    const outcomes = await MigrationExecutor.applyPending(db as unknown as MigrationClient, bundled);
    const failed = outcomes.filter((o) => !o.applied);
    expect(failed).toEqual([]);
  }, 120000);
  afterAll(async () => {
    await db?.$disconnect();
    if (admin && name) {
      console.log('Confirmed drop target ' + name);
      await admin.$executeRawUnsafe('DROP DATABASE "' + name + '" WITH (FORCE)');
    }
    await admin?.$disconnect();
  }, 120000);
  async function scenario(run: (tx: Prisma.TransactionClient) => Promise<void>) {
    const rollback = new Error('test rollback');
    try {
      await db.$transaction(
        async (tx) => {
          await run(tx);
          throw rollback;
        },
        { timeout: 120000 }
      );
    } catch (e) {
      if (e !== rollback) throw e;
    }
  }
  async function rows(tx: Prisma.TransactionClient) {
    const result: Record<string, unknown> = {};
    for (const table of tables)
      result[table] = await tx.$queryRawUnsafe(
        `SELECT (to_jsonb(t)-'branchId')::text AS data FROM "${table}" t ORDER BY id`
      );
    return result;
  }
  for (const existing of [false, true])
    it(
      existing
        ? 'uses the one active branch and preserves every existing value'
        : 'creates MAIN and backfills USD/LBP history without changing a value',
      () =>
        scenario(async (tx) => {
          const { userId } = await seedOwnershipHistory(tx);
          const branch = existing
            ? await insertMigrationRow(tx, 'branches', {
                code: 'HISTORY',
                name: 'History',
                createdById: userId,
              })
            : undefined;
          const before = await rows(tx);
          await tx.$executeRawUnsafe(migration);
          expect(await rows(tx)).toEqual(before);
          const [main] = await tx.$queryRawUnsafe<Array<{ id: string; code: string }>>(
            'SELECT id,code FROM branches WHERE "isActive"'
          );
          expect(main.code).toBe(existing ? 'HISTORY' : 'MAIN');
          if (branch) expect(main.id).toBe(branch);
          for (const table of tables) {
            const [n] = await tx.$queryRawUnsafe<Array<{ n: number }>>(
              'SELECT count(*)::int n FROM "' +
                table +
                '" WHERE "branchId" IS DISTINCT FROM $1::uuid',
              main.id
            );
            expect(n.n).toBe(0);
          }
        }),
      120000
    );
  it(
    'leaves a fresh installation empty for setup',
    () =>
      scenario(async (tx) => {
        await tx.$executeRawUnsafe(migration);
        const [n] = await tx.$queryRawUnsafe<Array<{ n: number }>>(
          'SELECT count(*)::int n FROM branches'
        );
        expect(n.n).toBe(0);
      }),
    120000
  );
  it(
    'rejects two active branches atomically',
    () =>
      scenario(async (tx) => {
        const { userId } = await seedOwnershipHistory(tx);
        for (const code of ['A', 'B'])
          await insertMigrationRow(tx, 'branches', { code, name: code, createdById: userId });
        await tx.$executeRawUnsafe('SAVEPOINT before_ownership');
        await expect(tx.$executeRawUnsafe(migration)).rejects.toThrow(/Multiple active branches/);
        await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT before_ownership');
        const [n] = await tx.$queryRawUnsafe<Array<{ n: number }>>(
          "SELECT count(*)::int n FROM information_schema.columns WHERE table_name='debts' AND column_name='branchId'"
        );
        expect(n.n).toBe(0);
      }),
    120000
  );
  for (const table of ['users', 'customers', 'activity_logs'])
    it(
      'rejects non-null legacy ' + table + '.branchId atomically',
      () =>
        scenario(async (tx) => {
          const { userId } = await seedOwnershipHistory(tx);
          if (table === 'activity_logs')
            await insertMigrationRow(tx, table, {
              userId,
              entityId: userId,
              branchId: randomUUID(),
            });
          else
            await tx.$executeRawUnsafe(
              'UPDATE "' + table + '" SET "branchId"=$1::uuid',
              randomUUID()
            );
          const before = await rows(tx);
          await tx.$executeRawUnsafe('SAVEPOINT before_ownership');
          await expect(tx.$executeRawUnsafe(migration)).rejects.toThrow(/non-null legacy/);
          await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT before_ownership');
          expect(await rows(tx)).toEqual(before);
        }),
      120000
    );
  async function ownedScenario(
    run: (
      tx: Prisma.TransactionClient,
      fixture: Awaited<ReturnType<typeof seedOwnershipHistory>>,
      a: string,
      b: string
    ) => Promise<void>
  ) {
    return scenario(async (tx) => {
      const fixture = await seedOwnershipHistory(tx);
      await tx.$executeRawUnsafe(migration);
      const [a] = await tx.$queryRawUnsafe<Array<{ id: string }>>('SELECT id FROM branches');
      const b = await insertMigrationRow(tx, 'branches', {
        code: 'SECOND',
        name: 'Second',
        isActive: false,
        createdById: fixture.userId,
      });
      await run(tx, fixture, a.id, b);
    });
  }
  for (const table of [
    'debts',
    'installment_plans',
    'payments',
    'sales_orders',
    'sales_returns',
    'cash_refunds',
    'customer_credits',
    'supplier_transactions',
    'supplier_receivings',
    'service_jobs',
  ]) {
    it(
      'raw SQL rejects cross-branch ' + table,
      () =>
        ownedScenario(async (tx, fixture, a, b) => {
          const [source] = await tx.$queryRawUnsafe<Array<{ row: Record<string, unknown> }>>(
            'SELECT to_jsonb(t) AS row FROM "' +
              table +
              '" t ' +
              (table === 'sales_orders'
                ? 'WHERE "customerId" IS NOT NULL '
                : table === 'supplier_receivings'
                  ? 'WHERE "supplierId" IS NOT NULL '
                  : '') +
              'ORDER BY id LIMIT 1'
          );
          const row = { ...source.row, id: randomUUID(), branchId: b };
          for (const key of ['orderNumber', 'returnNumber', 'idempotencyKey', 'jobNumber'])
            if (key in row) row[key] = randomUUID();
          if (table === 'sales_returns') row.sequence = 99;
          if (table === 'cash_refunds' || table === 'customer_credits') {
            const [original] = await tx.$queryRawUnsafe<Array<{ row: Record<string, unknown> }>>(
              'SELECT to_jsonb(t) AS row FROM sales_returns t ORDER BY id LIMIT 1'
            );
            row.salesReturnId = await insertMigrationRow(tx, 'sales_returns', {
              ...original.row,
              id: randomUUID(),
              returnNumber: randomUUID(),
              idempotencyKey: randomUUID(),
              sequence: 99,
            });
          }
          await tx.$executeRawUnsafe('SAVEPOINT reject_cross_branch');
          await expect(insertMigrationRow(tx, table, row)).rejects.toThrow(/_branchId_fkey/);
          await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT reject_cross_branch');
        }),
      120000
    );
  }
  it(
    'rejects branch changes on every owned table, permitting no-op updates',
    () =>
      ownedScenario(async (tx, _fixture, _a, b) => {
        for (const table of tables) {
          await tx.$executeRawUnsafe('SAVEPOINT immutable_branch');
          await expect(
            tx.$executeRawUnsafe('UPDATE "' + table + '" SET "branchId"=$1::uuid', b)
          ).rejects.toThrow(/branchId cannot be changed once a record exists/);
          await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT immutable_branch');
          await tx.$executeRawUnsafe('UPDATE "' + table + '" SET "branchId"="branchId"');
        }
      }),
    120000
  );
  it(
    'derives walk-in sale and supplier-less receiving ownership from creation access',
    () =>
      ownedScenario(async (tx, fixture, a, _b) => {
        const sale = await tx.salesOrder.findFirstOrThrow({ where: { customerId: null } });
        const created = await SalesOrdersRepository.create(
          { ...sale, id: randomUUID(), orderNumber: randomUUID(), idempotencyKey: null },
          tx
        );
        expect(created.branchId).toBe(a);
        const receiving = await tx.supplierReceiving.findFirstOrThrow({
          where: { supplierId: null },
        });
        const received = await SupplierReceivingsRepository.create(
          { ...receiving, id: randomUUID(), idempotencyKey: null },
          tx
        );
        expect(received.branchId).toBe(a);
        expect(created.createdById).toBe(fixture.userId);
      }),
    120000
  );
  it(
    'returns CUSTOMER_BRANCH_MISMATCH before attempting an order customer change',
    () =>
      ownedScenario(async (tx, fixture, _a, b) => {
        const customerId = await insertMigrationRow(tx, 'customers', {
          createdBy: fixture.userId,
          branchId: b,
        });
        const id = fixture.records.sales_orders[0];
        await tx.salesOrder.update({ where: { id }, data: { fulfillmentStatus: 'DRAFT' } });
        const spy = vi
          .spyOn(transactions, 'runFinancialTransaction')
          .mockImplementation((operation) => operation(tx));
        try {
          await expect(
            SalesOrdersService.update(
              id,
              { customerId, reason: 'Choose customer' },
              { userId: fixture.userId, role: 'ADMIN' },
              {}
            )
          ).rejects.toMatchObject({ statusCode: 409, code: 'CUSTOMER_BRANCH_MISMATCH' });
          expect((await tx.salesOrder.findUniqueOrThrow({ where: { id } })).customerId).not.toBe(
            customerId
          );
        } finally {
          spy.mockRestore();
        }
      }),
    120000
  );
});
