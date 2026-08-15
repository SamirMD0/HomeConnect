import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const migrationPath = path.resolve(
  __dirname,
  '../../../../prisma/migrations/20260815120000_add_supplier_purchase_lines/migration.sql'
);
const schemaPath = path.resolve(__dirname, '../../../../prisma/schema.prisma');
const sql = fs.readFileSync(migrationPath, 'utf8');
const schema = fs.readFileSync(schemaPath, 'utf8');

describe('supplier purchase database foundation', () => {
  it('keeps money on the purchase line and out of the inventory tables', () => {
    const line = modelBlock('SupplierPurchaseLine');
    expect(line).toContain('unitPrice');
    expect(line).toContain('lineTotal');
    // Cost and valuation must not leak into the receiving tables: they are
    // inventory records, and this release does not do accounting valuation.
    expect(modelBlock('SupplierReceivingItem')).not.toMatch(/unitPrice|lineTotal|cost|amount/i);
    expect(modelBlock('SupplierReceiving')).not.toMatch(/unitPrice|lineTotal|cost|amount/i);
  });

  it('makes a duplicate stock increase for one billed line unrepresentable', () => {
    expect(modelBlock('SupplierPurchaseLine')).toContain('receivingItemId       String?                  @unique @db.Uuid');
    expect(sql).toContain('CREATE UNIQUE INDEX "supplier_purchase_lines_receivingItemId_key"');
    // Already in production from v1.9.3, and still the defence against a second
    // debt for one delivery.
    expect(modelBlock('SupplierTransaction')).toContain('supplierReceivingId String?                   @unique @db.Uuid');
  });

  it('is additive, with no backfill and no rewrite of existing rows', () => {
    expect(sql).not.toMatch(/^\s*(?:DROP|TRUNCATE|DELETE|UPDATE|INSERT)\b/im);
    expect(sql).not.toMatch(/^\s*ALTER TYPE\b/im);
    expect(sql.match(/^CREATE TABLE\b/gim)).toHaveLength(1);
    expect(sql).toContain('CREATE TABLE "supplier_purchase_lines"');
    // The only altered table is supplier_transactions, and only to add columns.
    const alteredTables = [...sql.matchAll(/ALTER TABLE\s+"([a-z_]+)"/gi)].map((match) => match[1]);
    expect([...new Set(alteredTables)].sort()).toEqual(['supplier_purchase_lines', 'supplier_transactions']);
    expect(sql).not.toMatch(/ALTER TABLE "supplier_transactions"[\s\S]*?(?:DROP|ALTER) COLUMN/i);
  });

  it('adds only nullable or defaulted columns so v1.9.3 rows stay valid', () => {
    const addColumns = [...sql.matchAll(/ADD COLUMN "(\w+)" (\w+)([^,;]*)/g)];
    expect(addColumns).toHaveLength(3);
    for (const [, name, , rest] of addColumns) {
      const nullable = !/NOT NULL/.test(rest);
      const defaulted = /DEFAULT/.test(rest);
      expect(nullable || defaulted, `${name} must be nullable or defaulted`).toBe(true);
    }
  });

  it('lets the database refuse a manual line that could move stock', () => {
    expect(sql).toContain('"supplier_purchase_lines_manual_shape_check"');
    expect(sql).toMatch(/kind" <> 'MANUAL' OR \([\s\S]*?"productId" IS NULL[\s\S]*?"receivingItemId" IS NULL/);
    expect(sql).toContain('"supplier_purchase_lines_product_shape_check"');
  });

  it('requires a stated reason whenever a total is set by hand', () => {
    expect(sql).toContain('"supplier_transactions_override_requires_reason_check"');
    expect(sql).toMatch(/amountOverride" = false OR btrim\(COALESCE\("amountOverrideReason", ''\)\) <> ''/);
  });

  it('allows a zero-value line but never a negative one', () => {
    expect(sql).toContain('CHECK ("lineTotal" >= 0)');
    expect(sql).toContain('CHECK ("unitPrice" IS NULL OR "unitPrice" >= 0)');
    expect(sql).toContain('CHECK ("quantity" IS NULL OR ("quantity" > 0 AND "quantity" <= 100000))');
  });

  it('never makes the receipt number unique', () => {
    const uniqueIndexes = sql.match(/^CREATE UNIQUE INDEX[\s\S]*?;/gim) ?? [];
    expect(uniqueIndexes).toHaveLength(1);
    expect(uniqueIndexes.join('\n')).not.toMatch(/receiptNumber/);
    // A plain index supports the duplicate warning without constraining writes.
    expect(sql).toContain('CREATE INDEX "supplier_transactions_supplierId_receiptNumber_idx"');
  });

  it('keeps history restrictive on every new foreign key', () => {
    expect(sql.match(/FOREIGN KEY/g)).toHaveLength(3);
    expect(sql.match(/ON DELETE RESTRICT ON UPDATE CASCADE/g)).toHaveLength(3);
  });

  it('creates no purchase, receiving, movement, or ledger row', () => {
    expect(sql).not.toMatch(/PURCHASE_RECEIPT|OPENING_BALANCE|SUPPLIER_DEBT/);
  });
});

function modelBlock(name: string): string {
  const match = schema.match(new RegExp(`model ${name} \\{[\\s\\S]*?\\n\\}`));
  if (!match) throw new Error(`Missing Prisma model ${name}`);
  return match[0];
}
