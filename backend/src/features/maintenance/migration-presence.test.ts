import { describe, expect, it } from 'vitest';
import { classifyPresence, expectedObjects, SchemaObjects } from './migration-presence';
import { BundledMigration, MigrationRunner } from './migration-runner';

const migration = (sql: string): BundledMigration => ({ name: '20260101000000_test', sql, checksum: 'x' });

const schema = (overrides: Partial<SchemaObjects> = {}): SchemaObjects => ({
  tables: new Set(),
  columns: new Set(),
  types: new Set(),
  indexes: new Set(),
  enumValues: new Set(),
  extensions: new Set(),
  ...overrides,
});

describe('expectedObjects', () => {
  it('extracts tables, columns, types and indexes from quoted Prisma DDL', () => {
    expect(expectedObjects(`
      CREATE TYPE "Mode" AS ENUM ('A','B');
      CREATE TABLE "product_images" ("productId" UUID NOT NULL);
      ALTER TABLE "products" ADD COLUMN "imageUrl" TEXT;
      CREATE UNIQUE INDEX "products_sku_key" ON "products"("sku");
    `)).toEqual([
      'table:product_images',
      'column:products.imageUrl',
      'type:Mode',
      'index:products_sku_key',
    ]);
  });

  it('handles bare identifiers, IF NOT EXISTS and schema prefixes', () => {
    expect(expectedObjects(`
      CREATE INDEX IF NOT EXISTS customers_name_trgm_idx ON customers USING gin (name gin_trgm_ops);
      CREATE TABLE IF NOT EXISTS "public"."sales_orders" ("id" UUID);
      ALTER TABLE products ADD COLUMN IF NOT EXISTS sku TEXT;
    `)).toEqual([
      'table:sales_orders',
      'column:products.sku',
      'index:customers_name_trgm_idx',
    ]);
  });

  it('extracts enum values and extensions', () => {
    expect(expectedObjects(`
      CREATE EXTENSION IF NOT EXISTS pg_trgm;
      ALTER TYPE "LabelBarcodeSource" ADD VALUE IF NOT EXISTS 'AUTO';
    `)).toEqual(['enum:LabelBarcodeSource.AUTO', 'extension:pg_trgm']);
  });

  it('ignores commented-out DDL', () => {
    expect(expectedObjects(`-- CREATE TABLE "never_created" ()`)).toEqual([]);
  });
});

describe('classifyPresence', () => {
  it('reports PRESENT when every declared object exists', () => {
    const result = classifyPresence(
      migration('CREATE TABLE "product_images" ("productId" UUID); ALTER TABLE "products" ADD COLUMN "imageUrl" TEXT;'),
      schema({ tables: new Set(['product_images']), columns: new Set(['products.imageUrl']) })
    );
    expect(result.verdict).toBe('PRESENT');
    expect(result.missing).toEqual([]);
  });

  it('vetoes with MISSING when any declared object is absent', () => {
    const result = classifyPresence(
      migration('CREATE TABLE "product_images" ("productId" UUID); ALTER TABLE "products" ADD COLUMN "imageUrl" TEXT;'),
      schema({ tables: new Set(['product_images']) })
    );
    expect(result.verdict).toBe('MISSING');
    expect(result.missing).toEqual(['column:products.imageUrl']);
  });

  it('never claims PRESENT for a migration that drops or renames', () => {
    for (const sql of [
      'ALTER TABLE "products" DROP COLUMN "legacy";',
      'DROP TABLE "old_table";',
      'ALTER TABLE "products" RENAME COLUMN "a" TO "b";',
    ]) {
      expect(classifyPresence(migration(sql), schema()).verdict).toBe('UNKNOWN');
    }
  });

  it('reports UNKNOWN when nothing detectable is declared', () => {
    const result = classifyPresence(migration(`UPDATE products SET "x" = 'AUTO';`), schema());
    expect(result.verdict).toBe('UNKNOWN');
    expect(result.expected).toEqual([]);
  });
});

/**
 * Guards the parser against the real corpus: every bundled migration must be
 * classifiable, and a migration that creates objects must declare at least one.
 */
describe('bundled migrations', () => {
  const bundled = MigrationRunner.readBundled();

  it('reads the bundled set', () => {
    expect(bundled.length).toBeGreaterThan(0);
  });

  it('classifies every bundled migration against an empty schema without throwing', () => {
    for (const entry of bundled) {
      const result = classifyPresence(entry, schema());
      expect(['PRESENT', 'MISSING', 'UNKNOWN']).toContain(result.verdict);
      // Nothing can be PRESENT when the database has nothing.
      expect(result.verdict).not.toBe('PRESENT');
    }
  });

  it('detects objects in the migrations that create tables', () => {
    const init = bundled.find((entry) => entry.name.endsWith('_add_product_image'));
    expect(init).toBeDefined();
    expect(expectedObjects(init!.sql)).toEqual(['table:product_images', 'column:products.imageUrl']);
  });
});
