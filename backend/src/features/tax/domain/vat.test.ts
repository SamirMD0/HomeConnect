import { Currency } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { calculateVatLine, presentExVatPrice, presentVatPrice, reverseVatSnapshot } from './vat';

describe('calculateVatLine', () => {
  it('keeps a VAT-inclusive USD 100 retail price as the final amount payable', () => {
    const result = calculateVatLine({ currency: Currency.USD, quotedUnitPrice: '100.00', quantity: 1, priceIncludesVat: true, taxRatePercent: '11.000', taxCode: 'LB_STANDARD' });
    expect(result.lineTotalExVat.toFixed(2)).toBe('90.09');
    expect(result.vatAmount.toFixed(2)).toBe('9.91');
    expect(result.lineTotalIncVat.toFixed(2)).toBe('100.00');
  });

  it('adds VAT to an explicitly VAT-exclusive USD 100 price', () => {
    const result = calculateVatLine({ currency: Currency.USD, quotedUnitPrice: '100.00', quantity: 1, priceIncludesVat: false, taxRatePercent: '11.000', taxCode: 'LB_STANDARD' });
    expect(result.lineTotalExVat.toFixed(2)).toBe('100.00');
    expect(result.vatAmount.toFixed(2)).toBe('11.00');
    expect(result.lineTotalIncVat.toFixed(2)).toBe('111.00');
  });
  it('calculates exclusive VAT after discount', () => {
    const result = calculateVatLine({ currency: Currency.USD, quotedUnitPrice: '100.00', quantity: 2, discountAmount: '20.00', priceIncludesVat: false, taxRatePercent: '11.000', taxCode: 'LB_STANDARD' });
    expect(result.lineTotalExVat.toFixed(2)).toBe('180.00');
    expect(result.vatAmount.toFixed(2)).toBe('19.80');
    expect(result.lineTotalIncVat.toFixed(2)).toBe('199.80');
  });

  it('preserves an inclusive quote exactly', () => {
    const result = calculateVatLine({ currency: Currency.USD, quotedUnitPrice: '19.99', quantity: 1, priceIncludesVat: true, taxRatePercent: '11.000', taxCode: 'LB_STANDARD' });
    expect(result.unitPriceExVat.toFixed(2)).toBe('18.01');
    expect(result.lineTotalExVat.toFixed(2)).toBe('18.01');
    expect(result.vatAmount.toFixed(2)).toBe('1.98');
    expect(result.lineTotalIncVat.toFixed(2)).toBe('19.99');
  });

  it('rounds LBP to whole units with ROUND_HALF_UP', () => {
    const result = calculateVatLine({ currency: Currency.LBP, quotedUnitPrice: '100000', quantity: 1, priceIncludesVat: true, taxRatePercent: '11.000', taxCode: 'LB_STANDARD' });
    expect(result.lineTotalExVat.toFixed(0)).toBe('90090');
    expect(result.vatAmount.toFixed(0)).toBe('9910');
    expect(result.lineTotalIncVat.toFixed(0)).toBe('100000');
  });

  it.each([['LB_ZERO'], ['EXEMPT']])('keeps %s classification when the rate is zero', (taxCode) => {
    const result = calculateVatLine({ currency: Currency.USD, quotedUnitPrice: '25.00', quantity: 1, priceIncludesVat: false, taxRatePercent: '0.000', taxCode });
    expect(result.taxCodeSnapshot).toBe(taxCode);
    expect(result.vatAmount.toFixed(2)).toBe('0.00');
    expect(result.lineTotalIncVat.toFixed(2)).toBe('25.00');
  });

  it('keeps preset output ex-VAT and adds VAT only for presentation', () => {
    const result = presentExVatPrice('150.00', '11.000', Currency.USD);
    expect(result.priceExVat.toFixed(2)).toBe('150.00');
    expect(result.vatAmount.toFixed(2)).toBe('16.50');
    expect(result.priceIncVat.toFixed(2)).toBe('166.50');
  });

  it('presents mixed inclusive and exclusive selling prices without changing either policy', () => {
    const inclusive = presentVatPrice('100.00', '11.000', Currency.USD, true);
    const exclusive = presentVatPrice('100.00', '11.000', Currency.USD, false);
    expect(inclusive.priceIncVat.toFixed(2)).toBe('100.00');
    expect(exclusive.priceIncVat.toFixed(2)).toBe('111.00');
  });

  it('keeps an original historical snapshot unchanged after the configured rate changes', () => {
    const original = calculateVatLine({ currency: Currency.USD, quotedUnitPrice: '100.00', quantity: 1, priceIncludesVat: true, taxRatePercent: '11.000', taxCode: 'LB_STANDARD' });
    const later = calculateVatLine({ currency: Currency.USD, quotedUnitPrice: '100.00', quantity: 1, priceIncludesVat: true, taxRatePercent: '12.000', taxCode: 'LB_STANDARD' });
    expect(original.taxRateSnapshot.toFixed(3)).toBe('11.000');
    expect(original.vatAmount.toFixed(2)).toBe('9.91');
    expect(later.vatAmount.toFixed(2)).toBe('10.71');
  });

  it('refunds from the original VAT snapshot rather than a current rate', () => {
    const reversal = reverseVatSnapshot({
      taxRateSnapshot: '11.000', taxCodeSnapshot: 'LB_STANDARD', unitPriceExVat: '90.09',
      vatAmount: '9.91', lineTotalExVat: '90.09', lineTotalIncVat: '100.00',
    }, Currency.USD);
    expect(reversal).toMatchObject({ taxCodeSnapshot: 'LB_STANDARD' });
    expect(reversal.taxRateSnapshot.toFixed(3)).toBe('11.000');
    expect(reversal.lineTotalExVat.toFixed(2)).toBe('-90.09');
    expect(reversal.vatAmount.toFixed(2)).toBe('-9.91');
    expect(reversal.lineTotalIncVat.toFixed(2)).toBe('-100.00');
  });

  it('INV-24 keeps ex-VAT plus VAT exactly equal to every inclusive quote across many values', () => {
    for (let cents = 1; cents <= 2_000; cents += 1) {
      const quoted = (cents / 100).toFixed(2);
      const result = calculateVatLine({
        currency: Currency.USD,
        quotedUnitPrice: quoted,
        quantity: 1,
        priceIncludesVat: true,
        taxRatePercent: '11.000',
        taxCode: 'LB_STANDARD',
      });
      expect(result.lineTotalExVat.plus(result.vatAmount).toFixed(2)).toBe(quoted);
      expect(result.lineTotalIncVat.toFixed(2)).toBe(quoted);
    }
  });
});
