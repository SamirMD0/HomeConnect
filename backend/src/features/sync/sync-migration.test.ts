import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = fs.readFileSync(path.resolve(
  'backend/prisma/migrations/20261114120000_sync_change_log/migration.sql'
), 'utf8');
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
