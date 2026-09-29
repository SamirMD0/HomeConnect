import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const migrationPath = path.resolve(
  __dirname,
  '../../../prisma/migrations/20260827090000_add_supplier_idempotency/migration.sql'
);
const schemaPath = path.resolve(__dirname, '../../../prisma/schema.prisma');
const sql = fs.readFileSync(migrationPath, 'utf8');
const schema = fs.readFileSync(schemaPath, 'utf8');

describe('supplier command idempotency migration', () => {
  it('adds one nullable unique key to each root command table', () => {
    expect(modelBlock('SupplierTransaction')).toMatch(/idempotencyKey\s+String\?\s+@unique/);
    expect(modelBlock('SupplierReceiving')).toMatch(/idempotencyKey\s+String\?\s+@unique/);
    expect(sql).toContain('ALTER TABLE "supplier_transactions" ADD COLUMN "idempotencyKey" TEXT;');
    expect(sql).toContain('ALTER TABLE "supplier_receivings" ADD COLUMN "idempotencyKey" TEXT;');
    expect(sql).toContain('CREATE UNIQUE INDEX "supplier_transactions_idempotencyKey_key"');
    expect(sql).toContain('CREATE UNIQUE INDEX "supplier_receivings_idempotencyKey_key"');
  });

  it('is additive, performs no backfill, and leaves receipt-number reuse alone', () => {
    expect(sql).not.toMatch(/^\s*(?:DROP|TRUNCATE|DELETE|UPDATE|INSERT)\b/im);
    expect(sql).not.toMatch(/ALTER TYPE|NOT NULL|DEFAULT/i);
    expect(sql).not.toMatch(/receiptNumber/);
    expect(sql.match(/ADD COLUMN/g)).toHaveLength(2);
    expect(sql.match(/CREATE UNIQUE INDEX/g)).toHaveLength(2);
  });
});

function modelBlock(name: string): string {
  const match = schema.match(new RegExp(`model ${name} \\{[\\s\\S]*?\\n\\}`));
  if (!match) throw new Error(`Missing Prisma model ${name}`);
  return match[0];
}
