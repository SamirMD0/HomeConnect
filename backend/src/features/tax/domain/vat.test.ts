import { Currency } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { calculateVatLine, presentExVatPrice } from './vat';

describe('calculateVatLine', () => {
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
