import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { assertSqlIsSafe, scanSqlForUnsafeStatements } from './sql-safety-scanner';

const REPAIR_DIR = path.join(__dirname, '../../../prisma/repair');
const MIGRATIONS_DIR = path.join(__dirname, '../../../prisma/migrations');

describe('sql safety scanner — rejects destructive SQL', () => {
  it('rejects DROP TABLE', () => {
    const result = scanSqlForUnsafeStatements('DROP TABLE "customers";');
    expect(result.safe).toBe(false);
    expect(result.violations[0].code).toBe('DROP_STATEMENT');
  });

  it('rejects TRUNCATE and DELETE', () => {
    expect(scanSqlForUnsafeStatements('TRUNCATE "payments";').violations[0].code).toBe('TRUNCATE_STATEMENT');
    expect(scanSqlForUnsafeStatements('DELETE FROM "payments";').violations[0].code).toBe('DELETE_STATEMENT');
  });

  it('rejects dropping a column or a constraint', () => {
    expect(scanSqlForUnsafeStatements('ALTER TABLE "products" DROP COLUMN "sku";').violations[0].code).toBe('DROP_COLUMN');
    expect(scanSqlForUnsafeStatements('ALTER TABLE "products" DROP CONSTRAINT "fk";').violations[0].code).toBe('DROP_CONSTRAINT');
  });

  it('rejects a column type change, in both spellings', () => {
    expect(scanSqlForUnsafeStatements('ALTER TABLE "t" ALTER COLUMN "c" TYPE TEXT;').violations[0].code).toBe('COLUMN_TYPE_CHANGE');
    expect(scanSqlForUnsafeStatements('ALTER TABLE "t" ALTER COLUMN "c" SET DATA TYPE TEXT;').violations[0].code).toBe('COLUMN_TYPE_CHANGE');
  });

  it('finds destructive SQL hidden inside a DO block, past its control flow', () => {
    expect(scanSqlForUnsafeStatements('DO $$ BEGIN DROP TABLE "x"; END $$;').safe).toBe(false);
    expect(scanSqlForUnsafeStatements(`DO $$ BEGIN IF EXISTS (SELECT 1) THEN TRUNCATE "payments"; END IF; END $$;`).safe).toBe(false);
    expect(scanSqlForUnsafeStatements(`DO $$ BEGIN DELETE FROM "debts"; END $$;`).safe).toBe(false);
  });

  it('reports every violation in one pass', () => {
    const result = scanSqlForUnsafeStatements('DROP TABLE a; TRUNCATE b; DELETE FROM c;');
    expect(result.violations.map((violation) => violation.statementIndex)).toEqual([1, 2, 3]);
  });

  it('throws a message naming the file and each problem', () => {
    expect(() => assertSqlIsSafe('DROP TABLE a;', 'bad.sql')).toThrow(/bad\.sql/);
  });
});

describe('sql safety scanner — allows legitimate repair SQL', () => {
  it('allows additive DDL', () => {
    expect(scanSqlForUnsafeStatements('ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "sku" TEXT;').safe).toBe(true);
    expect(scanSqlForUnsafeStatements('CREATE TABLE IF NOT EXISTS "t" ("id" UUID);').safe).toBe(true);
    expect(scanSqlForUnsafeStatements('CREATE INDEX IF NOT EXISTS "i" ON "t" ("id");').safe).toBe(true);
    expect(scanSqlForUnsafeStatements('CREATE EXTENSION IF NOT EXISTS pg_trgm;').safe).toBe(true);
  });

  it('allows ON DELETE referential actions, which are not DELETE statements', () => {
    const sql = 'ALTER TABLE "a" ADD CONSTRAINT "fk" FOREIGN KEY ("b") REFERENCES "c"("id") ON DELETE RESTRICT ON UPDATE CASCADE;';
    expect(scanSqlForUnsafeStatements(sql).safe).toBe(true);
  });

  it('allows an enum value that merely contains the word DROP', () => {
    expect(scanSqlForUnsafeStatements(`CREATE TYPE "k" AS ENUM ('WORKSHOP_DROP_OFF');`).safe).toBe(true);
  });

  it('allows DROP NOT NULL and DROP DEFAULT, which destroy nothing', () => {
    expect(scanSqlForUnsafeStatements('ALTER TABLE "sales_orders" ALTER COLUMN "customerId" DROP NOT NULL;').safe).toBe(true);
    expect(scanSqlForUnsafeStatements('ALTER TABLE "t" ALTER COLUMN "c" DROP DEFAULT;').safe).toBe(true);
  });

  it('allows SET NOT NULL and SET DEFAULT', () => {
    expect(scanSqlForUnsafeStatements('ALTER TABLE "t" ALTER COLUMN "c" SET NOT NULL;').safe).toBe(true);
    expect(scanSqlForUnsafeStatements(`ALTER TABLE "t" ALTER COLUMN "c" SET DEFAULT 'X';`).safe).toBe(true);
  });

  it('is not fooled by a header comment that lists the banned keywords', () => {
    const sql = '--   - No DROP, TRUNCATE, DELETE, or financial amount changes.\nSELECT 1;';
    expect(scanSqlForUnsafeStatements(sql).safe).toBe(true);
  });

  it('allows a NULL backfill for a newly added column', () => {
    // The real 1.0.7 / 1.1.2 pattern: only rows with no value yet are touched.
    const sql = `UPDATE "debts" SET "kind" = 'STANDARD' WHERE "kind" IS NULL;`;
    expect(scanSqlForUnsafeStatements(sql).safe).toBe(true);
  });

  it('allows migration bookkeeping on _prisma_migrations', () => {
    const sql = `UPDATE "_prisma_migrations" SET "rolled_back_at" = now() WHERE "migration_name" = 'x';`;
    expect(scanSqlForUnsafeStatements(sql).safe).toBe(true);
  });

  it('allows only the reviewed product label AUTO preference flip', () => {
    const safe = `UPDATE products SET "labelBarcodeSource" = 'AUTO' WHERE "labelBarcodeSource" = 'SKU' AND barcode IS NOT NULL;`;
    expect(scanSqlForUnsafeStatements(safe).safe).toBe(true);
    expect(scanSqlForUnsafeStatements(`UPDATE products SET "labelBarcodeSource" = 'AUTO' WHERE "labelBarcodeSource" = 'SKU';`).safe).toBe(false);
  });

  it('still rejects an UPDATE that could overwrite existing values', () => {
    expect(scanSqlForUnsafeStatements(`UPDATE "debts" SET "amount" = 0;`).safe).toBe(false);
    expect(scanSqlForUnsafeStatements(`UPDATE "debts" SET "amount" = 0 WHERE "id" = 'x';`).safe).toBe(false);
    // Setting two columns but only guarding one is not a backfill.
    expect(scanSqlForUnsafeStatements(`UPDATE "d" SET "a" = 1, "b" = 2 WHERE "a" IS NULL;`).safe).toBe(false);
  });
});

/**
 * The regression guard that matters: every repair file the shop has actually run
 * must pass. If a future tightening of the rules breaks one of these, it breaks
 * the ability to recover a business PC.
 */
describe('sql safety scanner — real bundled files', () => {
  const repairFiles = fs.readdirSync(REPAIR_DIR).filter((name) => name.endsWith('.sql'));

  it('finds all 22 repair files', () => {
    expect(repairFiles).toHaveLength(22);
  });

  it.each(repairFiles)('accepts %s', (name) => {
    const sql = fs.readFileSync(path.join(REPAIR_DIR, name), 'utf8');
    const result = scanSqlForUnsafeStatements(sql);
    expect(result.violations).toEqual([]);
    expect(result.statementCount).toBeGreaterThan(0);
  });

  const migrationDirs = fs.readdirSync(MIGRATIONS_DIR).filter((name) => /^\d{14}_/.test(name));

  it.each(migrationDirs)('accepts migration %s', (name) => {
    const file = path.join(MIGRATIONS_DIR, name, 'migration.sql');
    if (!fs.existsSync(file)) return;
    expect(scanSqlForUnsafeStatements(fs.readFileSync(file, 'utf8')).violations).toEqual([]);
  });
});
