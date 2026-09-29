import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
const migration = readFileSync(
  'backend/prisma/migrations/20260914180000_add_product_categories/migration.sql',
  'utf8'
);
describe('additive English category migration', () => {
  it('adds nullable product linkage and restricts category/product deletion', () => {
    expect(migration).toContain('ADD COLUMN "categoryId" UUID;');
    expect(migration.match(/ON DELETE RESTRICT/g)).toHaveLength(2);
    expect(migration).toContain('categories_not_self_parent_check');
  });
  it('does not seed, backfill, rewrite history or add an Arabic name field', () => {
    expect(migration).not.toMatch(/\b(?:INSERT|UPDATE|DELETE)\s+(?:INTO|FROM|"products")/i);
    expect(migration).not.toContain('nameAr');
    expect(migration).not.toMatch(/\bDROP\b/);
  });
});
