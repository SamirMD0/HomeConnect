import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const migration = fs.readFileSync(path.resolve(__dirname, '../../../prisma/migrations/20260903120000_add_vat_foundation/migration.sql'), 'utf8');
const retailDefaultMigration = fs.readFileSync(path.resolve(__dirname, '../../../prisma/migrations/20260908120000_default_retail_prices_vat_inclusive/migration.sql'), 'utf8');
const schema = fs.readFileSync(path.resolve(__dirname, '../../../prisma/schema.prisma'), 'utf8');
const seed = fs.readFileSync(path.resolve(__dirname, '../../../prisma/seed.ts'), 'utf8');

describe('VAT database foundation', () => {
  it('preserves the original foundation step, then makes existing and future retail products VAT-inclusive', () => {
    expect(modelBlock('Product')).toMatch(/priceIncludesVat\s+Boolean\s+@default\(true\)/);
    expect(migration).toContain('UPDATE "products" SET "priceIncludesVat" = false');
    expect(retailDefaultMigration).toContain('SET "priceIncludesVat" = true');
    expect(retailDefaultMigration).toContain('ALTER COLUMN "priceIncludesVat" SET DEFAULT true');
  });

  it('changes product configuration only and never recalculates historical transaction snapshots', () => {
    expect(retailDefaultMigration).not.toMatch(/sales_order_items|supplier_purchase_lines/);
    expect(retailDefaultMigration).not.toMatch(/taxRateSnapshot|vatAmount|lineTotalIncVat/);
  });

  it.each(['sales_order_items', 'supplier_purchase_lines'])('preserves every historical %s total as genuine no-VAT history', (table) => {
    expect(migration).toContain(`UPDATE "${table}" SET "taxRateSnapshot" = 0 WHERE "taxRateSnapshot" IS NULL;`);
    expect(migration).toContain(`UPDATE "${table}" SET "vatAmount" = 0 WHERE "vatAmount" IS NULL;`);
    expect(migration).toContain(`UPDATE "${table}" SET "lineTotalIncVat" = "lineTotal" WHERE "lineTotalIncVat" IS NULL;`);
    // taxCodeSnapshot is nullable and starts NULL when the column is added, so
    // no UPDATE is needed (or wanted) to preserve the historical classification.
    expect(migration).toContain('ADD COLUMN "taxCodeSnapshot" TEXT');
  });

  it('enforces the stored ex-VAT plus VAT invariant', () => {
    expect(migration.match(/CHECK \("lineTotalIncVat" = "lineTotal" \+ "vatAmount"\)/g)).toHaveLength(2);
  });

  it('seeds only the approved standard and zero classifications', () => {
    expect(seed).toContain("code: 'LB_STANDARD'");
    expect(seed).toContain("ratePercent: '11.000'");
    expect(seed).toContain("code: 'LB_ZERO'");
    expect(seed).not.toContain("code: 'EXEMPT'");
  });
});

function modelBlock(name: string): string {
  const match = schema.match(new RegExp(`model ${name} \\{[\\s\\S]*?\\n\\}`));
  if (!match) throw new Error(`Missing Prisma model ${name}`);
  return match[0];
}
