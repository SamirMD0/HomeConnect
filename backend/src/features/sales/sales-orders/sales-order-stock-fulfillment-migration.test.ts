import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const migrationPath = path.resolve(
  __dirname,
  '../../../../prisma/migrations/20260813160000_add_sales_order_stock_fulfillments/migration.sql'
);
const sql = fs.readFileSync(migrationPath, 'utf8');

describe('sales-order stock fulfillment migration', () => {
  it('is additive, has no backfill, and creates no supplier receiving object', () => {
    expect(sql).not.toMatch(/^\s*(?:DROP|TRUNCATE|DELETE|UPDATE|INSERT)\b/im);
    expect(sql.match(/^CREATE TABLE\b/gim)).toHaveLength(1);
    expect(sql).toContain('CREATE TABLE "sales_order_stock_fulfillments"');
    expect(sql).not.toMatch(/supplier_receiv/i);
    expect(sql.match(/^ALTER TABLE\s+"([^"]+)"/gim))
      .toEqual(expect.arrayContaining(new Array(7).fill('ALTER TABLE "sales_order_stock_fulfillments"')));
  });

  it('adds the exact audit enum values and fulfillment status enum', () => {
    expect(sql).toContain('CREATE TYPE "SalesOrderStockFulfillmentStatus" AS ENUM (\'ACTIVE\', \'REVERSED\')');
    expect(sql).toContain('ALTER TYPE "SalesAuditAction" ADD VALUE \'DEDUCT_STOCK\'');
    expect(sql).toContain('ALTER TYPE "SalesAuditAction" ADD VALUE \'RESTORE_STOCK\'');
  });

  it('contains the idempotency indexes and all three checks', () => {
    for (const name of [
      'sales_order_stock_fulfillments_stockMovementId_key',
      'sales_order_stock_fulfillments_reversalStockMovementId_key',
      'sales_order_stock_fulfillments_one_active_per_item',
      'sales_order_stock_fulfillments_positive_quantity_check',
      'sales_order_stock_fulfillments_reversal_coherent_check',
      'sales_order_stock_fulfillments_reversal_reason_nonempty_check',
    ]) {
      expect(sql).toContain(`"${name}"`);
    }
    expect(sql).toContain('WHERE "status" = \'ACTIVE\'');
  });

  it('uses seven restrictive foreign keys so linked history cannot be deleted', () => {
    expect(sql.match(/FOREIGN KEY/g)).toHaveLength(7);
    expect(sql.match(/ON DELETE RESTRICT ON UPDATE CASCADE/g)).toHaveLength(7);
  });
});
