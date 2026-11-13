import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { isIsolatedTestDatabase } from '../../../test/database';

const migration = path.resolve(
  'backend/prisma/migrations/20261111120000_supplier_bills_inbox/migration.sql'
);
const sql = fs.readFileSync(migration, 'utf8');
describe('supplier bill migration', () => {
  it('backfills ownership before requiring it and preserves receipt data', () => {
    expect(sql.indexOf('UPDATE "supplier_receiving_receipts"')).toBeLessThan(
      sql.indexOf('ALTER COLUMN "supplierId" SET NOT NULL')
    );
    expect(sql).toContain('RAISE EXCEPTION');
    expect(sql).toContain('ALTER COLUMN "supplierReceivingId" DROP NOT NULL');
    expect(sql).not.toMatch(/(?:DROP TABLE|DROP COLUMN|TRUNCATE|DELETE FROM)/i);
    expect(sql).toContain('"supplier_receipt_blobs"');
  });
});
const enabled =
  process.env.RUN_FINANCIAL_DB_TESTS === '1' && isIsolatedTestDatabase(process.env.DATABASE_URL);
(enabled ? describe : describe.skip)('supplier bill backfill on a throwaway database', () => {
  it('refuses supplier-less legacy photos atomically, then preserves and backfills the original row', async () => {
    const name = 'homeconnect_test_bill_migration_' + randomUUID().replaceAll('-', '');
    const url = new URL(process.env.DATABASE_URL!);
    url.pathname = '/' + name;
    if (!isIsolatedTestDatabase(url.toString())) throw new Error('Isolated test database required');
    const admin = new PrismaClient();
    const db = new PrismaClient({ datasources: { db: { url: url.toString() } } });
    const run = () =>
      execFileSync(
        process.execPath,
        [
          path.resolve('node_modules/prisma/build/index.js'),
          'db',
          'execute',
          '--file',
          migration,
          '--url',
          url.toString(),
        ],
        { encoding: 'utf8', windowsHide: true, timeout: 60000, stdio: 'pipe' }
      );
    const branch = randomUUID(),
      supplier = randomUUID(),
      receiving = randomUUID(),
      receipt = randomUUID();
    try {
      await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
      await db.$executeRawUnsafe('CREATE TABLE branches (id UUID PRIMARY KEY)');
      await db.$executeRawUnsafe('CREATE TABLE suppliers (id UUID PRIMARY KEY)');
      await db.$executeRawUnsafe(
        'CREATE TABLE supplier_receivings (id UUID PRIMARY KEY, "supplierId" UUID, "branchId" UUID NOT NULL)'
      );
      await db.$executeRawUnsafe(
        'CREATE TABLE supplier_receiving_receipts (id UUID PRIMARY KEY, "supplierReceivingId" UUID NOT NULL, filename TEXT, mime TEXT, bytes INTEGER, "capturedAt" TIMESTAMP, CONSTRAINT "supplier_receiving_receipts_supplierReceivingId_fkey" FOREIGN KEY ("supplierReceivingId") REFERENCES supplier_receivings(id) ON DELETE CASCADE)'
      );
      await db.$executeRaw`INSERT INTO branches (id) VALUES (${branch}::uuid)`;
      await db.$executeRaw`INSERT INTO suppliers (id) VALUES (${supplier}::uuid)`;
      await db.$executeRaw`INSERT INTO supplier_receivings (id, "branchId") VALUES (${receiving}::uuid, ${branch}::uuid)`;
      await db.$executeRaw`INSERT INTO supplier_receiving_receipts (id, "supplierReceivingId", filename, mime, bytes, "capturedAt") VALUES (${receipt}::uuid, ${receiving}::uuid, 'original.jpg', 'image/jpeg', 123, '2026-10-03')`;
      expect(run).toThrow(/assign a supplier/);
      const columns = await db.$queryRaw<
        Array<{ column_name: string }>
      >`SELECT column_name FROM information_schema.columns WHERE table_name = 'supplier_receiving_receipts'`;
      expect(columns.some((column) => column.column_name === 'supplierId')).toBe(false);
      await db.$executeRaw`UPDATE supplier_receivings SET "supplierId" = ${supplier}::uuid WHERE id = ${receiving}::uuid`;
      run();
      const rows = await db.$queryRaw<
        {
          id: string;
          supplierId: string;
          branchId: string;
          filename: string;
          bytes: number;
          supplierReceivingId: string | null;
        }[]
      >`SELECT * FROM supplier_receiving_receipts`;
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        id: receipt,
        supplierId: supplier,
        branchId: branch,
        supplierReceivingId: receiving,
        filename: 'original.jpg',
        bytes: 123,
      });
      await db.$executeRaw`UPDATE supplier_receiving_receipts SET "supplierReceivingId" = NULL WHERE id = ${receipt}::uuid`;
      const bytes = Buffer.from([0, 255, 1]);
      await db.$executeRaw`INSERT INTO supplier_receipt_blobs ("receiptId", data) VALUES (${receipt}::uuid, ${bytes})`;
      await db.$executeRaw`DELETE FROM supplier_receiving_receipts WHERE id = ${receipt}::uuid`;
      expect(await db.$queryRaw`SELECT * FROM supplier_receipt_blobs`).toEqual([]);
    } finally {
      await db.$disconnect();
      await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
      await admin.$disconnect();
    }
  }, 120000);
});
