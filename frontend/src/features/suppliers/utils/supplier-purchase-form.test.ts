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

/** The two halves live on their own lines so bidirectional text stays readable. */
const bilingual = (english: string, arabic: string) => `${english}\n${arabic}`;

describe('suggestedPurchaseDescription', () => {
  it('reads as a bilingual sentence naming the product, total, and receipt', () => {
    expect(suggestedPurchaseDescription([existing()], 'INV-2291', '630.00')).toBe(bilingual(
      'Purchased TCL AC × 3 for 630.00 on invoice INV-2291',
      'تم شراء TCL AC × 3 بمبلغ 630.00 بموجب الفاتورة INV-2291'
    ));
  });

  it('puts each language on its own line', () => {
    const [english, arabic, ...rest] = suggestedPurchaseDescription([existing()], 'INV-1', '630.00').split('\n');
    expect(rest).toHaveLength(0);
    expect(english.startsWith('Purchased')).toBe(true);
    expect(arabic.startsWith('تم شراء')).toBe(true);
    expect(english).not.toContain('تم شراء');
  });

  it('omits the quantity when only one unit was bought', () => {
    expect(suggestedPurchaseDescription([existing({ quantity: '1' })], '', '210.00')).toBe(bilingual(
      'Purchased TCL AC for 210.00',
      'تم شراء TCL AC بمبلغ 210.00'
    ));
  });

  it('uses the typed name for a quick-added product', () => {
    expect(suggestedPurchaseDescription([quickAdd()], 'INV-7', '600.00')).toBe(bilingual(
      'Purchased TCL AC 2HP × 2 for 600.00 on invoice INV-7',
      'تم شراء TCL AC 2HP × 2 بمبلغ 600.00 بموجب الفاتورة INV-7'
    ));
  });

  it('uses the description of a manual line', () => {
    expect(suggestedPurchaseDescription([manual()], '', '25.50')).toBe(bilingual(
      'Purchased Freight for 25.50',
      'تم شراء Freight بمبلغ 25.50'
    ));
  });

  it('separates several lines with each language’s own comma', () => {
    const result = suggestedPurchaseDescription([existing(), manual()], 'INV-2291', '655.50');
    expect(result).toContain('TCL AC × 3, Freight for 655.50');
    expect(result).toContain('TCL AC × 3، Freight بمبلغ 655.50');
  });

  it('summarises the tail once there are more than three lines', () => {
    const base = [existing(), manual(), quickAdd()];
    const extra = ['Cable', 'Install kit', 'Bracket'].map((description) => manual({ description }));
    const result = suggestedPurchaseDescription([...base, ...extra], '', '0');
    expect(result).toContain('TCL AC × 3, Freight, TCL AC 2HP × 2 and 3 more');
    expect(result).toContain('و3 بنود أخرى');
  });

  it('uses the Arabic singular and dual forms for one and two extra lines', () => {
    const base = [existing(), manual(), quickAdd()];
    const extra = (count: number) => Array.from({ length: count }, (_, index) => manual({ description: `Extra ${index}` }));
    expect(suggestedPurchaseDescription([...base, ...extra(1)], '', '0')).toContain('وبند آخر');
    expect(suggestedPurchaseDescription([...base, ...extra(2)], '', '0')).toContain('وبندان آخران');
  });

  it('drops the parts that are not filled in yet', () => {
    expect(suggestedPurchaseDescription([existing()], '', '0'))
      .toBe(bilingual('Purchased TCL AC × 3', 'تم شراء TCL AC × 3'));
    expect(suggestedPurchaseDescription([existing()], 'INV-1', '0')).toBe(bilingual(
      'Purchased TCL AC × 3 on invoice INV-1',
      'تم شراء TCL AC × 3 بموجب الفاتورة INV-1'
    ));
  });

  it('is empty while no line names anything, leaving the form to say so', () => {
    expect(suggestedPurchaseDescription([emptyLine()], 'INV-1', '0')).toBe('');
    expect(suggestedPurchaseDescription([], 'INV-1', '10.00')).toBe('');
  });

  it('ignores a receipt number that is only whitespace', () => {
    expect(suggestedPurchaseDescription([existing()], '   ', '630.00')).toBe(bilingual(
      'Purchased TCL AC × 3 for 630.00',
      'تم شراء TCL AC × 3 بمبلغ 630.00'
    ));
  });

  it('keeps both halves intact when product names are long', () => {
    const long = existing({ productName: 'X'.repeat(400) });
    const result = suggestedPurchaseDescription([long, long, long], 'INV-1', '630.00');
    expect(result.length).toBeLessThanOrEqual(500);
    // Truncating the item list rather than the sentence means the Arabic half
    // still arrives whole instead of being cut off mid-word.
    expect(result).toContain('…');
    expect(result).toContain('بموجب الفاتورة INV-1');
  });

  it('handles an Arabic product name without mangling either half', () => {
    expect(suggestedPurchaseDescription([existing({ productName: 'مكيف تي سي إل' })], 'INV-9', '630.00')).toBe(bilingual(
      'Purchased مكيف تي سي إل × 3 for 630.00 on invoice INV-9',
      'تم شراء مكيف تي سي إل × 3 بمبلغ 630.00 بموجب الفاتورة INV-9'
    ));
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
