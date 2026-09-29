import { describe, expect, it } from 'vitest';
import { parseCsvRecords, parseProductInventoryCsv } from './product-import.parser';

const row = ',"Stock Inventory Summary By Family","WH : ALL,Till Date:26/09/2026",,"--",,,,"Family","Qty","Cost","Family:","ELECTRONICS","Code","Description","Qty","Cost USD","Total","43S5K","TCL 43"" FHD SMART GOOGLE TV QLED",3.00,0.00,0.00,"ELECTRONICS",12.00,0.00,"TOTAL",24.00,0.00,"Page -1 of 1"';

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
});
