import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = path.resolve('backend/prisma/migrations/20260814170000_link_supplier_transactions_to_receivings/migration.sql');
const sql = fs.readFileSync(migrationPath, 'utf8');

describe('supplier transaction receiving-link migration', () => {
  it('is additive and creates no business rows', () => {
    expect(sql).toMatch(/ADD COLUMN "supplierReceivingId" UUID/);
    expect(sql).not.toMatch(/^\s*(?:INSERT|UPDATE|DELETE|DROP|TRUNCATE)\b/im);
  });

  it('enforces one debt transaction per receiving document with restrictive deletion', () => {
    expect(sql).toMatch(/CHECK \("supplierReceivingId" IS NULL OR "type" = 'SUPPLIER_DEBT'\)/);
    expect(sql).toMatch(/CREATE UNIQUE INDEX "supplier_transactions_supplierReceivingId_key"/);
    expect(sql).toMatch(/FOREIGN KEY \("supplierReceivingId", "supplierId"\) REFERENCES "supplier_receivings"\("id", "supplierId"\)[\s\S]*ON DELETE RESTRICT/);
  });
});
