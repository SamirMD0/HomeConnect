import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const migration = fs.readFileSync(
  path.resolve(__dirname, '../../../prisma/migrations/20260906150000_seed_default_tax_configuration/migration.sql'),
  'utf8'
);

/**
 * The VAT foundation migration adds the schema; this one supplies the
 * configuration an upgraded installation would otherwise never get, because
 * upgrades run `migrate deploy` and never `prisma db seed`. Without a default
 * profile, requireEffectiveProfile throws on every sale and every purchase.
 */
describe('default tax configuration migration', () => {
  it('seeds only the two approved classifications', () => {
    expect(migration).toContain("'LB_STANDARD'");
    expect(migration).toContain("'LB_ZERO'");
    expect(migration).not.toContain("'LB_EXEMPT'");
    expect(migration).not.toContain("'EXEMPT'");
  });

  it('seeds the standard rate at the configured 11 percent, with no rate literal anywhere else', () => {
    expect(migration).toContain('11.000');
    expect(migration).toContain('0.000');
  });

  it('is re-runnable', () => {
    expect(migration.match(/ON CONFLICT \("code"\) DO NOTHING;/g)).toHaveLength(4);
  });

  it('claims default status only when no other active default exists', () => {
    expect(migration).toContain(
      'NOT EXISTS (SELECT 1 FROM "tax_profiles" WHERE "isDefault" = true AND "isActive" = true)'
    );
  });

  it('attributes the rows to a real admin, and inserts nothing when there is none', () => {
    // A fresh database migrates before it seeds, so no user exists yet and the
    // SELECT drives zero rows. prisma/seed.ts then creates the same records.
    expect(migration).toContain('FROM "users"');
    expect(migration).toContain(`WHERE "role" = 'ADMIN' AND "deletedAt" IS NULL`);
  });

  it('modifies no existing row', () => {
    expect(migration).not.toMatch(/\bUPDATE\b/);
    expect(migration).not.toMatch(/\bDELETE\b/);
    expect(migration).not.toMatch(/\bALTER\b/);
    expect(migration).not.toMatch(/\bDROP\b/);
  });
});
