import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { scanSqlForUnsafeStatements } from '../../maintenance/sql-safety-scanner';

const migration = fs.readFileSync(path.resolve('backend/prisma/migrations/20260914140000_add_counter_payment_sources/migration.sql'), 'utf8');

describe('approved nullable counter Payment migration', () => {
  it('retains historical rows and requires a source and snapshot for customerless payments', () => {
    expect(migration).toContain('ALTER COLUMN "customerId" DROP NOT NULL');
    expect(migration).toContain('CHECK ("customerId" IS NOT NULL OR "salesOrderId" IS NOT NULL)');
    expect(migration).toContain('CHECK ("salesOrderId" IS NULL OR "sourceSnapshot" IS NOT NULL)');
    expect(migration).toContain('source_customer IS DISTINCT FROM NEW."customerId"');
    expect(migration).toContain('"counter_sale_customer_check"');
    expect(migration).toContain('"sales_orders_idempotencyKey_key"');
    expect(migration).not.toMatch(/(?:^|;)\s*(?:UPDATE|DELETE|INSERT|TRUNCATE)\s/im);
    expect(scanSqlForUnsafeStatements(migration).violations).toEqual([]);
  });
});
