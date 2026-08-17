import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const migrationPath = path.resolve(
  __dirname,
  '../../../prisma/migrations/20260814110000_add_supplier_receivings/migration.sql'
);
const correctionMigrationPath = path.resolve(
  __dirname,
  '../../../prisma/migrations/20260817120000_add_supplier_receiving_corrections/migration.sql'
);
const schemaPath = path.resolve(__dirname, '../../../prisma/schema.prisma');
const sql = fs.readFileSync(migrationPath, 'utf8');
const correctionSql = fs.readFileSync(correctionMigrationPath, 'utf8');
const schema = fs.readFileSync(schemaPath, 'utf8');

describe('supplier receiving database foundation', () => {
  it('defines date-only Prisma models and their authoritative movement link', () => {
    const receiving = modelBlock('SupplierReceiving');
    const item = modelBlock('SupplierReceivingItem');

    expect(receiving).toContain('supplierId      String?');
    expect(receiving).toContain('referenceNumber String?');
    expect(receiving).toContain('receivedOn      DateTime');
    expect(receiving).toContain('@db.Date');
    expect(receiving).not.toMatch(/\breceivedAt\b/);
    expect(receiving).not.toMatch(/\bupdatedAt\b/);
    expect(item).toMatch(/stockMovementId String\s+@unique @db\.Uuid/);
    expect(item).toContain('@@unique([receivingId, productId])');
  });

  it('is additive, has no backfill, and leaves existing business tables and enums untouched', () => {
    expect(sql).not.toMatch(/^\s*(?:DROP|TRUNCATE|DELETE|UPDATE|INSERT)\b/im);
    expect(sql).not.toMatch(/^\s*ALTER TYPE\b/im);
    expect(sql).not.toMatch(/^\s*ALTER TABLE\s+"(?:products|supplier_transactions|customers|debts|payments|payment_allocations|installment_plans|installments|transactions)"/im);
    expect(sql.match(/^CREATE TABLE\b/gim)).toHaveLength(2);
    expect(sql).toContain('CREATE TABLE "supplier_receivings"');
    expect(sql).toContain('CREATE TABLE "supplier_receiving_items"');
    expect(sql).not.toContain('PURCHASE_RECEIPT');
  });

  it('contains all required checks and no supplier/reference uniqueness rule', () => {
    for (const name of [
      'supplier_receivings_reference_nonempty_check',
      'supplier_receiving_items_positive_quantity_check',
      'supplier_receiving_items_quantity_limit_check',
    ]) {
      expect(sql).toContain(`"${name}"`);
    }
    expect(sql).toContain('CHECK ("quantity" > 0)');
    expect(sql).toContain('CHECK ("quantity" <= 100000)');
    expect(sql).toContain('CHECK ("referenceNumber" IS NULL OR btrim("referenceNumber") <> \'\')');

    const uniqueIndexes = sql.match(/^CREATE UNIQUE INDEX[\s\S]*?;/gim) ?? [];
    expect(uniqueIndexes).toHaveLength(2);
    expect(uniqueIndexes.join('\n')).not.toMatch(/supplierId|referenceNumber/);
  });

  it('adds the required indexes and five restrictive history foreign keys', () => {
    for (const name of [
      'supplier_receivings_supplierId_receivedOn_idx',
      'supplier_receivings_receivedOn_idx',
      'supplier_receivings_receivedById_idx',
      'supplier_receiving_items_stockMovementId_key',
      'supplier_receiving_items_receivingId_productId_key',
      'supplier_receiving_items_productId_createdAt_idx',
    ]) {
      expect(sql).toContain(`"${name}"`);
    }
    expect(sql.match(/FOREIGN KEY/g)).toHaveLength(5);
    expect(sql.match(/ON DELETE RESTRICT ON UPDATE CASCADE/g)).toHaveLength(5);
  });
});

describe('supplier receiving correction migration', () => {
  it('is additive: no drop, no delete, no backfill of business data', () => {
    expect(correctionSql).not.toMatch(/^\s*(?:DROP|TRUNCATE|DELETE|INSERT)\b/im);
    // The only UPDATE-shaped statements allowed are column additions, never a
    // row rewrite. Every new column is nullable or defaulted instead.
    expect(correctionSql).not.toMatch(/^\s*UPDATE\s+"/im);
    expect(correctionSql).toContain('ADD COLUMN "status" "SupplierReceivingStatus" NOT NULL DEFAULT \'POSTED\'');
    expect(correctionSql).toContain('ADD COLUMN "status" "SupplierReceivingItemStatus" NOT NULL DEFAULT \'ACTIVE\'');
  });

  it('adds a reserved reversal movement type rather than reusing a manual one', () => {
    expect(correctionSql).toContain(`ALTER TYPE "StockMovementType" ADD VALUE IF NOT EXISTS 'PURCHASE_RECEIPT_REVERSAL'`);
    expect(schema).toContain('PURCHASE_RECEIPT_REVERSAL');
    // The reversal type must never become selectable in the manual movement UI.
    const wired = fs.readFileSync(path.resolve(__dirname, 'inventory.types.ts'), 'utf8');
    expect(wired).toContain('StockMovementType.PURCHASE_RECEIPT_REVERSAL');
    expect(wired.slice(wired.indexOf('ACTIVE_STOCK_MOVEMENT_TYPES'), wired.indexOf('RESERVED_STOCK_MOVEMENT_TYPES')))
      .not.toContain('PURCHASE_RECEIPT_REVERSAL');
  });

  it('makes a half-finished void or reversal unrepresentable', () => {
    expect(correctionSql).toContain('"supplier_receivings_void_shape_check"');
    expect(correctionSql).toContain('"supplier_receiving_items_reversal_shape_check"');
    expect(correctionSql).toContain('CREATE UNIQUE INDEX "supplier_receiving_items_reversalStockMovementId_key"');
  });

  it('records who corrected a document, when, and why', () => {
    expect(correctionSql).toContain('CREATE TABLE "supplier_receiving_audits"');
    expect(correctionSql).toContain('"supplier_receiving_audits_reason_nonempty_check"');
    expect(modelBlock('SupplierReceivingAudit')).toContain('beforeValues      Json');
  });

  it('leaves financial and customer tables untouched', () => {
    expect(correctionSql).not.toMatch(/ALTER TABLE\s+"(?:supplier_transactions|customers|debts|payments|payment_allocations|installment_plans|installments|transactions|products)"/i);
  });
});

function modelBlock(name: string): string {
  const match = schema.match(new RegExp(`model ${name} \\{[\\s\\S]*?\\n\\}`));
  if (!match) throw new Error(`Missing Prisma model ${name}`);
  return match[0];
}
