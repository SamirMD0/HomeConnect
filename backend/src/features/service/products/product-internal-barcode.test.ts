import fs from 'fs';
import path from 'path';
import { describe, expect, it, vi } from 'vitest';
import { splitSqlStatements } from '../../maintenance/sql-statement-splitter';
import { ean13CheckDigit, formatInternalBarcode, generateInternalBarcode, isInternalBarcode } from './product-internal-barcode';

const MIGRATION = path.resolve(__dirname, '../../../../prisma/migrations/20260918121000_add_internal_product_barcodes/migration.sql');

describe('shop-internal product barcodes', () => {
  it('formats 200 + 9-digit sequence + a valid EAN-13 check digit', () => {
    expect(formatInternalBarcode(1)).toBe('2000000000015');
    expect(formatInternalBarcode(288)).toMatch(/^200000000288\d$/);
    for (const sequence of [1, 288, 123456789]) {
      const code = formatInternalBarcode(sequence);
      expect(code).toHaveLength(13);
      expect(isInternalBarcode(code)).toBe(true);
    }
  });

  it('computes the standard EAN-13 check digit', () => {
    // A real retail barcode from a printed label: 6 222048 413923.
    expect(ean13CheckDigit('622204841392')).toBe(3);
  });

  it('never classifies a manufacturer barcode as internal', () => {
    expect(isInternalBarcode('6222048413923')).toBe(false);
    expect(isInternalBarcode('2000000000018')).toBe(false);
    expect(isInternalBarcode('HC-000288')).toBe(false);
  });

  it('refuses a sequence that no longer fits in 9 digits', () => {
    expect(() => formatInternalBarcode(1_000_000_000)).toThrow();
  });

  it('skips numbers already taken by a hand-entered barcode', async () => {
    let next = 0n;
    const tx = {
      $queryRaw: vi.fn(async () => [{ value: ++next }]),
      product: { findFirst: vi.fn(async ({ where }: { where: { barcode: { equals: string } } }) => (where.barcode.equals === '2000000000015' ? { id: 'x' } : null)) },
    };
    await expect(generateInternalBarcode(tx as never)).resolves.toBe(formatInternalBarcode(2));
    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
  });

  it('ships an idempotent backfill that only fills empty barcodes and matches this format', () => {
    const sql = fs.readFileSync(MIGRATION, 'utf8');
    expect(sql).not.toContain('\r');
    expect(splitSqlStatements(sql)).toHaveLength(2);
    expect(sql).toContain('CREATE SEQUENCE IF NOT EXISTS "product_internal_barcode_seq"');
    expect(sql).toContain('WHERE "barcode" IS NULL');
    expect(sql).toContain("'200' || lpad(nextval('product_internal_barcode_seq')::text, 9, '0')");
    expect(sql).not.toMatch(/\b(DROP|DELETE|TRUNCATE)\b/i);
  });
});
