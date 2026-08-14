import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const migrationPath = path.resolve(
  __dirname,
  '../../../prisma/migrations/20260814110000_add_supplier_receivings/migration.sql'
);
const schemaPath = path.resolve(__dirname, '../../../prisma/schema.prisma');
const sql = fs.readFileSync(migrationPath, 'utf8');
const schema = fs.readFileSync(schemaPath, 'utf8');

describe('supplier receiving database foundation', () => {
  it('defines immutable date-only Prisma models and their authoritative movement link', () => {
    const receiving = modelBlock('SupplierReceiving');
    const item = modelBlock('SupplierReceivingItem');

    expect(receiving).toContain('supplierId      String?');
    expect(receiving).toContain('referenceNumber String?');
    expect(receiving).toContain('receivedOn      DateTime');
    expect(receiving).toContain('@db.Date');
    expect(receiving).not.toMatch(/\breceivedAt\b/);
    expect(receiving).not.toMatch(/\bupdatedAt\b/);
    expect(item).toContain('stockMovementId String            @unique @db.Uuid');
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

function modelBlock(name: string): string {
  const match = schema.match(new RegExp(`model ${name} \\{[\\s\\S]*?\\n\\}`));
  if (!match) throw new Error(`Missing Prisma model ${name}`);
  return match[0];
}
