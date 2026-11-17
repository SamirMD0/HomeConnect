import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = fs.readFileSync(path.resolve(
  'backend/prisma/migrations/20261114120000_sync_change_log/migration.sql'
), 'utf8');
const fanoutSql = fs.readFileSync(path.resolve(
  'backend/prisma/migrations/20261114180000_sync_change_log_fanout/migration.sql'
), 'utf8');
const functionBody = (table: string) => fanoutSql.split(`CREATE OR REPLACE FUNCTION sync_capture_${table}()`)[1].split('$$;')[0];
const tables = [
  'products', 'stock_movements', 'product_images', 'product_pricing_card_features',
  'customers', 'debts', 'installment_plans', 'installments', 'prepaid_purchases',
  'payments', 'payment_allocations', 'sales_orders', 'sales_order_items',
  'sales_order_stock_fulfillments', 'sales_returns', 'sales_return_items',
  'sales_return_receivable_allocations', 'cash_refunds', 'customer_credits',
  'customer_credit_applications', 'suppliers', 'supplier_transactions',
  'supplier_receivings', 'supplier_receiving_receipts', 'branches', 'categories',
  'users', 'user_branch_access', 'pricing_presets', 'tax_profiles', 'tax_rates',
];

describe('sync change log migration', () => {
  it.each(['debts', 'installment_plans', 'installments', 'payments', 'payment_allocations'])('invalidates the customer payment targets for %s writes', table => {
    const body = sql.split(`CREATE FUNCTION sync_capture_${table}()`)[1].split('$$;')[0];
    expect(body).toContain("'customer'");
    expect(body).toContain('customerId');
  });
  it('adds an independent append-only log without rewriting business data', () => {
    const statements = sql.replace(/--[^\n]*/g, '');
    expect(statements).not.toMatch(/\b(?:DROP|RENAME|TRUNCATE|ALTER|DELETE\s+FROM|UPDATE\s+\w+\s+SET)\b/i);
    expect(sql).toContain('"seq" BIGSERIAL PRIMARY KEY');
    expect(sql).toContain("CHECK (\"op\" IN ('upsert', 'delete'))");
    expect(sql).toContain('("entity", "entity_id")');
    expect(sql).toContain('("changed_at")');
  });

  it.each(tables)('captures inserts, updates and deletes on %s', (table) => {
    expect(sql).toContain(`AFTER INSERT OR UPDATE OR DELETE ON "${table}"`);
    expect(sql).toContain(`FOR EACH ROW EXECUTE FUNCTION sync_capture_${table}()`);
    const body = sql.split(`CREATE FUNCTION sync_capture_${table}()`)[1].split('$$;')[0];
    expect(body).toContain('INSERT INTO sync_changes');
    expect(body.indexOf('pg_advisory_xact_lock_shared(74103, 1)')).toBeGreaterThan(-1);
    expect(body.indexOf('pg_advisory_xact_lock_shared(74103, 1)')).toBeLessThan(body.indexOf('INSERT INTO sync_changes'));
    expect(body).toContain("IF TG_OP = 'DELETE' THEN r := OLD; ELSE r := NEW; END IF");
    expect(body).not.toMatch(/\bLOOP\b/i);
  });
});

describe('bounded sync fan-out follow-up migration', () => {
  it('replaces only the seven affected functions and preserves installed tables and triggers', () => {
    expect(fanoutSql.match(/CREATE OR REPLACE FUNCTION/g)).toHaveLength(7);
    expect(fanoutSql).not.toMatch(/\b(?:DROP\s+(?:TABLE|COLUMN|TRIGGER)|ALTER\s+TABLE|CREATE\s+(?:TABLE|TRIGGER)|DELETE\s+FROM|TRUNCATE)\b/i);
  });

  it.each(['products', 'stock_movements'])('avoids historical order targets for %s', table => {
    expect(functionBody(table)).toContain("'product'");
    expect(functionBody(table)).not.toContain("'sales_order'");
    expect(functionBody(table)).not.toContain('sales_order_items');
  });

  it('limits category product and category targets to recursively selected descendants on path changes', () => {
    const body = functionBody('categories');
    expect(body).toContain("IF TG_OP = 'UPDATE'");
    expect(body).toContain('ROW(OLD.name, OLD."parentId") IS DISTINCT FROM ROW(NEW.name, NEW."parentId")');
    expect(body).toContain('WITH RECURSIVE descendants(id)');
    expect(body).toContain('SELECT r.id WHERE path_changed');
    expect(body).toContain('JOIN descendants d ON c."parentId" = d.id');
    expect(body).toContain('p."categoryId" IN (SELECT id FROM descendants)');
    expect(body).toContain("SELECT 'category', d.id, 'upsert' FROM descendants d");
    expect(body).toContain("TG_OP IN ('INSERT', 'DELETE')");
    expect(body).toContain("SELECT 'category', OLD.\"parentId\", 'upsert'");
  });

  it('gates branch order targets on display changes and the owning branch', () => {
    const body = functionBody('branches');
    expect(body).toContain("TG_OP = 'UPDATE' AND ROW(OLD.name, OLD.code) IS DISTINCT FROM ROW(NEW.name, NEW.code)");
    expect(body).toContain('WHERE o."branchId" = r.id');
  });

  it.each(['pricing_presets', 'tax_profiles', 'tax_rates'])('gates %s on relevant values and targets its consumers', table => {
    const body = functionBody(table);
    expect(body).toContain("IF TG_OP = 'UPDATE' AND ROW(");
    expect(body).toContain('IS NOT DISTINCT FROM ROW(');
    expect(body.indexOf('THEN RETURN NULL')).toBeLessThan(body.indexOf('INSERT INTO sync_changes'));
    expect(body).not.toContain('"updatedAt"');
    expect(body).toContain(table === 'pricing_presets' ? 'p."pricingPresetId" IN (OLD.id, NEW.id)' : 'p."taxProfileId" IN (');
    expect(body).toContain('"isDefault"');
  });
});
