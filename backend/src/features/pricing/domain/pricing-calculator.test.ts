import { Decimal } from '@prisma/client/runtime/library';
import { describe, expect, it } from 'vitest';
import { calculatePricing } from './pricing-calculator';
import { PricingConfig } from './pricing-types';

const compound: PricingConfig = {
  expensePercent: new Decimal('10'),
  profitPercent: new Decimal('7'),
  discountBufferPercent: new Decimal('7'),
  installmentMarkupPercent: new Decimal('20'),
  downPaymentPercent: new Decimal('40'),
  installmentMonths: 3,
  calculationMode: 'COMPOUND',
  roundingMode: 'NONE',
};

describe('pricing calculator', () => {
  it('uses the exact compound formula without intermediate rounding', () => {
    const result = calculatePricing(new Decimal('300.00'), compound);
    expect(result).toMatchObject({
      cashPrice: '377.82', installmentPrice: '453.38', downPayment: '181.35',
      remaining: '272.03', monthlyPayment: '90.67', lastInstallmentPayment: '90.69',
    });
    expect(result.cashPrice).not.toBe('377.55');
    expect(typeof result.cashPrice).toBe('string');
  });

  it('distinguishes compound and simple formulas', () => {
    expect(calculatePricing(new Decimal('300'), compound).cashPrice).toBe('377.82');
    expect(calculatePricing(new Decimal('300'), { ...compound, calculationMode: 'SIMPLE' }).cashPrice).toBe('372.00');
  });

  it.each([1, 2, 3, 6, 12, 36])('re-sums installment residuals for %i months', (months) => {
    const result = calculatePricing(new Decimal('300'), { ...compound, installmentMonths: months });
    const sum = new Decimal(result.monthlyPayment).mul(months - 1).plus(result.lastInstallmentPayment);
    expect(sum.toFixed(2)).toBe(result.remaining);
    expect(new Decimal(result.downPayment).plus(result.remaining).toFixed(2)).toBe(result.installmentPrice);
  });

  it('supports zero and full down payments', () => {
    expect(calculatePricing(new Decimal('10'), { ...compound, downPaymentPercent: new Decimal(0) }).downPayment).toBe('0.00');
    expect(calculatePricing(new Decimal('10'), { ...compound, downPaymentPercent: new Decimal(100) })).toMatchObject({ remaining: '0.00', monthlyPayment: '0.00', lastInstallmentPayment: '0.00' });
  });

  it.each([
    ['NONE', '10.24'], ['NEAREST_0_50', '10.00'], ['NEAREST_1', '10.00'], ['CEIL_1', '11.00'],
  ] as const)('applies %s rounding', (roundingMode, expected) => {
    const result = calculatePricing(new Decimal('10.24'), {
      ...compound, expensePercent: new Decimal(0), profitPercent: new Decimal(0),
      discountBufferPercent: new Decimal(0), installmentMarkupPercent: new Decimal(0),
      downPaymentPercent: new Decimal(0), roundingMode,
    });
    expect(result.cashPrice).toBe(expected);
  });

  it('handles small exact decimals without JavaScript float drift', () => {
    const result = calculatePricing(new Decimal('0.07'), {
      ...compound, expensePercent: new Decimal('33.333'), profitPercent: new Decimal(0),
      discountBufferPercent: new Decimal(0), installmentMarkupPercent: new Decimal(0),
      downPaymentPercent: new Decimal(0),
    });
    expect(result.cashPrice).toBe('0.09');
  });
});
