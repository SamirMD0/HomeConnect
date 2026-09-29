import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { scanSqlForUnsafeStatements } from '../../maintenance/sql-safety-scanner';

const migration = fs.readFileSync(path.resolve('backend/prisma/migrations/20260914123000_add_supplier_due_dates/migration.sql'), 'utf8');

describe('supplier due-date additive migration', () => {
  it('adds nullable calendar dates without backfilling or modifying financial history', () => {
    expect(migration).toMatch(/ADD COLUMN "dueDate" DATE;/);
    expect(migration).not.toMatch(/NOT NULL|DEFAULT|\bUPDATE\b|\bDELETE\b|\bDROP\b/i);
    expect(scanSqlForUnsafeStatements(migration).violations).toEqual([]);
  });
});
