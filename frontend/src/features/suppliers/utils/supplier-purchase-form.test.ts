import { describe, expect, it } from 'vitest';
import {
  duplicateProductIds, emptyLine, hasQuickAdd, lineProblem, lineTotal, purchaseTotal,
  suggestedPurchaseDescription, toApiLines, withMode, type PurchaseLineDraft,
} from './supplier-purchase-form';

const existing = (overrides: Partial<PurchaseLineDraft> = {}): PurchaseLineDraft => ({
  ...emptyLine('EXISTING_PRODUCT'), productId: 'product-1', productName: 'TCL AC', productLabel: 'TCL AC · HC-1', quantity: '3', unitPrice: '210.00', ...overrides,
});
const manual = (overrides: Partial<PurchaseLineDraft> = {}): PurchaseLineDraft => ({
  ...emptyLine('MANUAL'), description: 'Freight', amount: '25.50', ...overrides,
});
const quickAdd = (overrides: Partial<PurchaseLineDraft> = {}): PurchaseLineDraft => ({
  ...emptyLine('NEW_PRODUCT'), newName: 'TCL AC 2HP', newModel: 'TAC-24', quantity: '2', unitPrice: '300.00', ...overrides,
});

describe('lineTotal', () => {
  it('multiplies quantity by unit price in exact cents', () => {
    expect(lineTotal(existing())).toBe('630.00');
    expect(lineTotal(existing({ quantity: '3', unitPrice: '0.10' }))).toBe('0.30');
  });

  it('does not drift on values that lose precision as floats', () => {
    expect(lineTotal(existing({ quantity: '3', unitPrice: '1.15' }))).toBe('3.45');
    expect(lineTotal(existing({ quantity: '7', unitPrice: '0.07' }))).toBe('0.49');
  });

  it('allows a zero-priced bonus line', () => {
    expect(lineTotal(existing({ unitPrice: '0' }))).toBe('0.00');
  });

  it('uses the entered amount for a manual line', () => {
    expect(lineTotal(manual())).toBe('25.50');
  });

  it('returns null while a line is incomplete rather than showing a wrong number', () => {
    expect(lineTotal(existing({ unitPrice: '' }))).toBeNull();
    expect(lineTotal(existing({ quantity: '' }))).toBeNull();
    expect(lineTotal(existing({ quantity: '0' }))).toBeNull();
    expect(lineTotal(manual({ amount: '' }))).toBeNull();
  });
});

describe('purchaseTotal', () => {
  it('sums mixed product and manual lines', () => {
    expect(purchaseTotal([existing(), manual()])).toBe('655.50');
  });

  it('skips incomplete lines instead of counting them as zero-priced', () => {
    expect(purchaseTotal([existing(), manual({ amount: '' })])).toBe('630.00');
  });

  it('is zero for an empty form', () => {
    expect(purchaseTotal([emptyLine()])).toBe('0.00');
  });
});

describe('lineProblem', () => {
  it('passes a complete line of each mode', () => {
    expect(lineProblem(existing())).toBeNull();
    expect(lineProblem(manual())).toBeNull();
    expect(lineProblem(quickAdd())).toBeNull();
  });

  it('requires a product on an existing-product line', () => {
    expect(lineProblem(existing({ productId: null }))).toContain('Select a product');
  });

  it('requires name and model on a quick-add line', () => {
    expect(lineProblem(quickAdd({ newName: '' }))).toContain('Product name is required');
    expect(lineProblem(quickAdd({ newModel: '' }))).toContain('Model is required');
  });

  it('requires a description and a positive amount on a manual line', () => {
    expect(lineProblem(manual({ description: '' }))).toContain('Description is required');
    expect(lineProblem(manual({ amount: '0' }))).toContain('greater than zero');
  });

  it('rejects a non-positive or fractional quantity', () => {
    expect(lineProblem(existing({ quantity: '0' }))).toContain('whole number');
    expect(lineProblem(existing({ quantity: '' }))).toContain('whole number');
  });

  it('requires a unit price to be entered', () => {
    expect(lineProblem(existing({ unitPrice: '' }))).toContain('unit price');
  });
});

describe('withMode', () => {
  it('clears fields belonging to the mode being left', () => {
    const switched = withMode(existing(), 'MANUAL');
    expect(switched.productId).toBeNull();
    expect(switched.unitPrice).toBe('');
    expect(switched.mode).toBe('MANUAL');
  });

  it('keeps the local key so React does not remount the row', () => {
    const line = existing();
    expect(withMode(line, 'MANUAL').key).toBe(line.key);
  });
});

describe('duplicateProductIds', () => {
  it('flags the same product used on two lines', () => {
    expect([...duplicateProductIds([existing(), existing()])]).toEqual(['product-1']);
  });

  it('ignores manual lines and empty selections', () => {
    expect(duplicateProductIds([manual(), manual(), existing({ productId: null })]).size).toBe(0);
  });
});

describe('hasQuickAdd', () => {
  it('detects a new-product line', () => {
    expect(hasQuickAdd([existing(), quickAdd()])).toBe(true);
    expect(hasQuickAdd([existing(), manual()])).toBe(false);
  });
});

describe('suggestedPurchaseDescription', () => {
  it('builds compact English and Arabic lines with product, total, and receipt', () => {
    expect(suggestedPurchaseDescription([existing()], 'INV-2291', '630.00'))
      .toBe('Purchase: TCL AC × 3 · 630.00 · #INV-2291\nشراء: TCL AC × 3 · 630.00 · #INV-2291');
  });

  it('puts each language on its own line', () => {
    const [english, arabic, ...rest] = suggestedPurchaseDescription([existing()], 'INV-1', '630.00').split('\n');
    expect(rest).toHaveLength(0);
    expect(english).toBe('Purchase: TCL AC × 3 · 630.00 · #INV-1');
    expect(arabic).toBe('شراء: TCL AC × 3 · 630.00 · #INV-1');
  });

  it('omits the quantity when only one unit was bought', () => {
    expect(suggestedPurchaseDescription([existing({ quantity: '1' })], '', '210.00'))
      .toBe('Purchase: TCL AC · 210.00\nشراء: TCL AC · 210.00');
  });

  it('uses the typed name for a quick-added product', () => {
    expect(suggestedPurchaseDescription([quickAdd()], 'INV-7', '600.00'))
      .toBe('Purchase: TCL AC 2HP × 2 · 600.00 · #INV-7\nشراء: TCL AC 2HP × 2 · 600.00 · #INV-7');
  });

  it('uses the description of a manual line', () => {
    expect(suggestedPurchaseDescription([manual()], '', '25.50'))
      .toBe('Purchase: Freight · 25.50\nشراء: Freight · 25.50');
  });

  it('separates several purchase lines cleanly', () => {
    const result = suggestedPurchaseDescription([existing(), manual()], 'INV-2291', '655.50');
    expect(result).toBe(
      'Purchase: TCL AC × 3, Freight · 655.50 · #INV-2291\nشراء: TCL AC × 3, Freight · 655.50 · #INV-2291'
    );
  });

  it('summarises the tail once there are more than three lines', () => {
    const base = [existing(), manual(), quickAdd()];
    const extra = ['Cable', 'Install kit', 'Bracket'].map((description) => manual({ description }));
    const result = suggestedPurchaseDescription([...base, ...extra], '', '0');
    expect(result).toBe(
      'Purchase: TCL AC × 3, Freight, TCL AC 2HP × 2 +3\nشراء: TCL AC × 3, Freight, TCL AC 2HP × 2 +3'
    );
  });

  it('drops the parts that are not filled in yet', () => {
    expect(suggestedPurchaseDescription([existing()], '', '0'))
      .toBe('Purchase: TCL AC × 3\nشراء: TCL AC × 3');
    expect(suggestedPurchaseDescription([existing()], 'INV-1', '0'))
      .toBe('Purchase: TCL AC × 3 · #INV-1\nشراء: TCL AC × 3 · #INV-1');
  });

  it('is empty while no line names anything, leaving the form to say so', () => {
    expect(suggestedPurchaseDescription([emptyLine()], 'INV-1', '0')).toBe('');
    expect(suggestedPurchaseDescription([], 'INV-1', '10.00')).toBe('');
  });

  it('ignores a receipt number that is only whitespace', () => {
    expect(suggestedPurchaseDescription([existing()], '   ', '630.00'))
      .toBe('Purchase: TCL AC × 3 · 630.00\nشراء: TCL AC × 3 · 630.00');
  });

  it('keeps the compact summary within the backend description limit', () => {
    const long = existing({ productName: 'X'.repeat(400) });
    const result = suggestedPurchaseDescription([long, long, long], 'INV-1', '630.00');
    expect(result.length).toBeLessThanOrEqual(500);
    expect(result).toContain('…');
    expect(result).toContain('\nشراء:');
    expect(result).toContain('· #INV-1');
  });

  it('handles an Arabic product name without duplicating it', () => {
    expect(suggestedPurchaseDescription([existing({ productName: 'مكيف تي سي إل' })], 'INV-9', '630.00'))
      .toBe('Purchase: مكيف تي سي إل × 3 · 630.00 · #INV-9\nشراء: مكيف تي سي إل × 3 · 630.00 · #INV-9');
  });
});

describe('toApiLines', () => {
  it('maps an existing-product line to canonical money', () => {
    expect(toApiLines([existing({ unitPrice: '210.5' })])).toEqual([
      { kind: 'EXISTING_PRODUCT', productId: 'product-1', quantity: 3, unitPrice: '210.50' },
    ]);
  });

  it('sends a manual line with no product fields at all', () => {
    expect(toApiLines([manual()])).toEqual([{ kind: 'MANUAL', description: 'Freight', amount: '25.50' }]);
  });

  it('normalizes blank optional quick-add fields to null', () => {
    expect(toApiLines([quickAdd()])).toEqual([{
      kind: 'NEW_PRODUCT', name: 'TCL AC 2HP', model: 'TAC-24',
      barcode: null, brand: null, sellingPrice: null, quantity: 2, unitPrice: '300.00',
    }]);
  });

  it('trims text before sending it', () => {
    expect(toApiLines([quickAdd({ newName: '  TCL  ', newBarcode: ' ABC-1234 ' })])[0]).toMatchObject({
      name: 'TCL', barcode: 'ABC-1234',
    });
  });
});
