import { Currency } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { Decimal } from '@prisma/client/runtime/library';
import { allocateReturnComponent, allocateReturnLine, deriveReturnSettlement } from './sales-return-calculation';

describe('sales return calculation', () => {
  it('allocates cumulative minor units and gives the final return the exact remainder', () => {
    const first = allocateReturnComponent({
      originalAmount: '10.00',
      soldQuantity: 3,
      previouslyReturnedQuantity: 0,
      previouslyAllocatedAmount: '0.00',
      returnQuantity: 1,
      currency: Currency.USD,
    });
    const second = allocateReturnComponent({
      originalAmount: '10.00',
      soldQuantity: 3,
      previouslyReturnedQuantity: 1,
      previouslyAllocatedAmount: first,
      returnQuantity: 1,
      currency: Currency.USD,
    });
    const final = allocateReturnComponent({
      originalAmount: '10.00',
      soldQuantity: 3,
      previouslyReturnedQuantity: 2,
      previouslyAllocatedAmount: first.plus(second),
      returnQuantity: 1,
      currency: Currency.USD,
    });

    expect(first.toFixed(2)).toBe('3.33');
    expect(second.toFixed(2)).toBe('3.34');
    expect(final.toFixed(2)).toBe('3.33');
    expect(first.plus(second).plus(final).toFixed(2)).toBe('10.00');
  });

  it('uses whole minor units for LBP', () => {
    expect(allocateReturnComponent({
      originalAmount: '1000',
      soldQuantity: 3,
      previouslyReturnedQuantity: 0,
      previouslyAllocatedAmount: '0',
      returnQuantity: 1,
      currency: Currency.LBP,
    }).toFixed(0)).toBe('333');
  });

  it('relieves the linked receivable before producing a refundable amount', () => {
    const settlement = deriveReturnSettlement('700.00', '500.00', Currency.USD);
    expect(settlement.receivableRelief.toFixed(2)).toBe('500.00');
    expect(settlement.refundable.toFixed(2)).toBe('200.00');
  });
});

describe('immutable sale-line cumulative return invariants', () => {
  const usdOriginal = {
    discountAmount: '0.00', subtotalExVat: '90.09', vatAmount: '9.91', totalIncVat: '100.00',
    baseSubtotalExVat: '90.09', baseVatAmount: '9.91', baseTotalIncVat: '100.00',
  };

  function runSequence(original: typeof usdOriginal, soldQuantity: number, quantities: number[], currency: Currency) {
    const history: Array<ReturnType<typeof allocateReturnLine> & { quantity: number }> = [];
    for (const quantity of quantities) {
      const result = allocateReturnLine({ original, soldQuantity, returnQuantity: quantity, previousReturns: history, currency });
      expect(result.subtotalExVat.plus(result.vatAmount).equals(result.totalIncVat)).toBe(true);
      expect(result.baseSubtotalExVat.plus(result.baseVatAmount).equals(result.baseTotalIncVat)).toBe(true);
      expect(result.totalIncVat.decimalPlaces()).toBeLessThanOrEqual(currency === Currency.USD ? 2 : 0);
      expect(result.vatAmount.decimalPlaces()).toBeLessThanOrEqual(currency === Currency.USD ? 2 : 0);
      history.push({ ...result, quantity });
    }
    for (const field of Object.keys(original) as Array<keyof typeof original>) {
      const cumulative = history.reduce((sum, entry) => sum.plus(entry[field]), new Decimal(0));
      expect(cumulative.equals(original[field]), field).toBe(true);
    }
    return history;
  }

  it('returns the first of two $50 VAT-inclusive units at 11% without a one-cent identity error', () => {
    const first = allocateReturnLine({ original: usdOriginal, soldQuantity: 2, returnQuantity: 1, previousReturns: [], currency: Currency.USD });
    expect(first.totalIncVat.toFixed(2)).toBe('50.00');
    expect(first.vatAmount.toFixed(2)).toBe('4.96');
    expect(first.subtotalExVat.toFixed(2)).toBe('45.04');
  });

  it('gives the second/final return the exact original gross, VAT, and subtotal remainders', () => {
    const history = runSequence(usdOriginal, 2, [1, 1], Currency.USD);
    expect(history[1].totalIncVat.toFixed(2)).toBe('50.00');
    expect(history[1].vatAmount.toFixed(2)).toBe('4.95');
    expect(history[1].subtotalExVat.toFixed(2)).toBe('45.05');
  });

  it.each([[1, 1, 1, 1, 1, 1, 1], [2, 1, 4], [4, 2, 1], [1, 4, 2]])(
    'reconciles USD across three or more requests and mixed multi-unit return order: %j', (...quantities) => {
      runSequence({ ...usdOriginal, discountAmount: '1.01' }, 7, quantities, Currency.USD);
    }
  );

  it('allocates LBP in whole units and base snapshots cumulatively rather than reconverting each partial', () => {
    const original = {
      discountAmount: '13', subtotalExVat: '1000', vatAmount: '110', totalIncVat: '1110',
      baseSubtotalExVat: '0.01', baseVatAmount: '0.00', baseTotalIncVat: '0.01',
    };
    const history = runSequence(original, 3, [1, 1, 1], Currency.LBP);
    expect(history.map((entry) => entry.baseTotalIncVat.toFixed(2))).toEqual(['0.00', '0.01', '0.00']);
  });

  it('uses fixed original base anchors even when their rounding differs from per-return conversion', () => {
    const original = {
      discountAmount: '0', subtotalExVat: '89500', vatAmount: '9845', totalIncVat: '99345',
      baseSubtotalExVat: '1.00', baseVatAmount: '0.11', baseTotalIncVat: '1.11',
    };
    for (const quantities of [[1, 1, 1], [2, 1], [1, 2]]) runSequence(original, 3, quantities, Currency.LBP);
  });

  it('keeps each original line independent when different lines are interleaved', () => {
    const histories = [[], []] as Array<Array<ReturnType<typeof allocateReturnLine> & { quantity: number }>>;
    const originals = [usdOriginal, { ...usdOriginal, subtotalExVat: '90.10', vatAmount: '9.91', totalIncVat: '100.01', baseSubtotalExVat: '90.10', baseVatAmount: '9.91', baseTotalIncVat: '100.01' }];
    for (const line of [1, 0, 0, 1, 1, 0]) {
      const result = allocateReturnLine({ original: originals[line], soldQuantity: 3, returnQuantity: 1, previousReturns: histories[line], currency: Currency.USD });
      histories[line].push({ ...result, quantity: 1 });
    }
    histories.forEach((history, line) => {
      for (const field of Object.keys(usdOriginal) as Array<keyof typeof usdOriginal>) {
        expect(history.reduce((sum, entry) => sum.plus(entry[field]), new Decimal(0)).equals(originals[line][field])).toBe(true);
      }
    });
  });
});
