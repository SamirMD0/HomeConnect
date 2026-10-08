import { describe, expect, it } from 'vitest';
import { MAX_PRODUCT_IMPORT_ROWS, parseCsvRecords, parseProductInventoryCsv } from './product-import.parser';
import { commitProductImportSchema } from './product-import.validator';

const row = ',"Stock Inventory Summary By Family","WH : ALL,Till Date:26/09/2026",,"--",,,,"Family","Qty","Cost","Family:","ELECTRONICS","Code","Description","Qty","Cost USD","Total","43S5K","TCL 43"" FHD SMART GOOGLE TV QLED",3.00,0.00,0.00,"ELECTRONICS",12.00,0.00,"TOTAL",24.00,0.00,"Page -1 of 1"';
const hiddenCostHeadersRow = ',"Stock Inventory Summary By Family","WH : ALL,Till Date:08/10/2026",,"--",,,,"Family","Qty","Cost","Family:","BEAUTY","Code","Description","Qty",,," SE-C9","BABYVERSE  HAIR DRYRE 1900W",1.00,0.00,0.00,"BEAUTY",177.00,0.00,"TOTAL","3,871.00",0.00,"Page -1 of 1"';

describe('product inventory CSV parser', () => {
  it('parses quoted commas and doubled quotes', () => {
    expect(parseCsvRecords('a,"b,c","say ""hi"""')).toEqual([['a', 'b,c', 'say "hi"']]);
  });

  it('extracts the embedded report values and treats zero cost as unknown', () => {
    expect(parseProductInventoryCsv(row)).toEqual([expect.objectContaining({
      rowNumber: 1,
      family: 'ELECTRONICS',
      externalCode: '43S5K',
      description: 'TCL 43" FHD SMART GOOGLE TV QLED',
      quantity: 3,
      costUsd: null,
      issues: [],
    })]);
  });

  it('keeps invalid rows for explicit review instead of silently skipping them', () => {
    const invalid = row.replace(',3.00,0.00,0.00,', ',3.50,0.00,0.00,');
    expect(parseProductInventoryCsv(invalid)[0].issues).toContain('Quantity must be a whole number between 0 and 100,000');
  });

  it('reads inventory exports with blank cost headers without using the footer total', () => {
    expect(parseProductInventoryCsv(hiddenCostHeadersRow)).toEqual([{
      rowNumber: 1, family: 'BEAUTY', externalCode: 'SE-C9',
      description: 'BABYVERSE  HAIR DRYRE 1900W', quantity: 1, costUsd: null, issues: [],
    }]);
  });

  it('reads mixed labelled and blank cost headers with BOM and CRLF', () => {
    const rows = parseProductInventoryCsv(`\uFEFF${row}\r\n${hiddenCostHeadersRow}`);
    expect(rows.map(({ rowNumber, externalCode, quantity }) => ({ rowNumber, externalCode, quantity }))).toEqual([
      { rowNumber: 1, externalCode: '43S5K', quantity: 3 },
      { rowNumber: 2, externalCode: 'SE-C9', quantity: 1 },
    ]);
  });

  it('retains invalid quantities when cost headers are blank', () => {
    const invalid = hiddenCostHeadersRow.replace(',1.00,0.00,0.00,', ',1.50,0.00,0.00,');
    expect(parseProductInventoryCsv(invalid)[0].issues).toContain('Quantity must be a whole number between 0 and 100,000');
  });

  it('allows all 922 products in a full inventory export and their commit decisions', () => {
    const rows = parseProductInventoryCsv(Array(922).fill(hiddenCostHeadersRow).join('\n'));
    expect(rows).toHaveLength(922);
    expect(rows[921].rowNumber).toBe(922);
    expect(commitProductImportSchema.safeParse({
      decisions: rows.map(({ rowNumber }) => ({ rowNumber, action: 'EXCLUDE' })),
    }).success).toBe(true);
  });

  it('enforces the same row limit for parsing and commit decisions', () => {
    const shortRow = 'Family:,TOOLS,Code,Description,Qty,,,A,Hammer,1,0,0';
    expect(parseProductInventoryCsv(Array(MAX_PRODUCT_IMPORT_ROWS).fill(shortRow).join('\n'))).toHaveLength(MAX_PRODUCT_IMPORT_ROWS);
    expect(() => parseProductInventoryCsv(Array(MAX_PRODUCT_IMPORT_ROWS + 1).fill(shortRow).join('\n'))).toThrow(/cannot exceed/);
    expect(commitProductImportSchema.safeParse({
      decisions: Array.from({ length: MAX_PRODUCT_IMPORT_ROWS + 1 }, (_, index) => ({ rowNumber: index + 1, action: 'EXCLUDE' })),
    }).success).toBe(false);
  });
});
