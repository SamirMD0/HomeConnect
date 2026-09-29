import { Currency } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { describe, expect, it } from 'vitest';
import { InvalidMoneyError } from './financial-errors';
import {
  addMoney,
  assertPositiveMoney,
  compareMoney,
  divideMoney,
  equalMoney,
  fromBaseAmount,
  moneyToMinorUnits,
  moneyToApiString,
  roundMoney,
  parseMoney,
  multiplyMoney,
  subtractMoney,
  sumMoney,
  toBaseAmount,
} from './money';

describe('financial money helpers', () => {
  it('adds decimal values without JavaScript floating point drift', () => {
    expect(moneyToApiString(addMoney('0.10', '0.20'))).toBe('0.30');
  });

  it('normalizes valid string and Decimal input to exact two-decimal API strings', () => {
    expect(moneyToApiString(parseMoney('10.1'))).toBe('10.10');
    expect(moneyToApiString(parseMoney(new Decimal('600.00')))).toBe('600.00');
  });

  it('accepts Decimal-like values from packaged Prisma runtime boundaries', () => {
    const packagedDecimal = {
      toString: () => '0',
      decimalPlaces: () => 0,
      isFinite: () => true,
    };

    expect(moneyToApiString(packagedDecimal)).toBe('0.00');
  });

  it('supports arithmetic and exact equality', () => {
    expect(moneyToApiString(subtractMoney('100.00', '33.33'))).toBe('66.67');
    expect(moneyToApiString(sumMoney(['10.00', new Decimal('0.25'), '0.75']))).toBe('11.00');
    expect(equalMoney('1.20', new Decimal('1.2'))).toBe(true);
  });

  it('multiplies and divides using Decimal factors and explicit rounding', () => {
    expect(moneyToApiString(multiplyMoney('0.07', '1.33333', Currency.USD, Decimal.ROUND_HALF_UP))).toBe('0.09');
    expect(moneyToApiString(divideMoney('10.00', '3', Currency.USD, Decimal.ROUND_FLOOR))).toBe('3.33');
    expect(() => divideMoney('10.00', '0', Currency.USD, Decimal.ROUND_HALF_UP)).toThrow(InvalidMoneyError);
  });

  it('compares values correctly', () => {
    expect(compareMoney('1.00', '2.00')).toBe(-1);
    expect(compareMoney('2.00', '1.00')).toBe(1);
    expect(compareMoney('2.00', '2')).toBe(0);
  });

  it('accepts large values within schema precision', () => {
    expect(moneyToApiString(parseMoney('9999999999.99'))).toBe('9999999999.99');
  });

  it('rejects invalid, negative, zero, over-precision, and oversized inputs where required', () => {
    expect(() => parseMoney('abc')).toThrow(InvalidMoneyError);
    expect(() => parseMoney('1.001')).toThrow(InvalidMoneyError);
    expect(() => parseMoney('10000000000.00')).toThrow(InvalidMoneyError);
    expect(() => assertPositiveMoney('-1.00')).toThrow(InvalidMoneyError);
    expect(() => assertPositiveMoney('0.00')).toThrow(InvalidMoneyError);
  });

  it('accepts only whole LBP input and serializes it without decimals', () => {
    expect(moneyToApiString(parseMoney('4500000.00', Currency.LBP), Currency.LBP)).toBe('4500000');
    expect(moneyToMinorUnits('4500000', Currency.LBP)).toBe(4500000n);
    expect(() => parseMoney('4500000.50', Currency.LBP)).toThrow('LBP money amount must be a whole number');
  });

  it('rounds computed LBP HALF_UP and snapshots USD base values', () => {
    expect(moneyToApiString(roundMoney('1000.5', Currency.LBP, Decimal.ROUND_HALF_UP), Currency.LBP)).toBe('1001');
    expect(moneyToApiString(toBaseAmount('4500000', Currency.LBP, '90000', Decimal.ROUND_HALF_UP))).toBe('50.00');
    expect(moneyToApiString(fromBaseAmount('50.01', Currency.LBP, '90000', Decimal.ROUND_HALF_UP), Currency.LBP)).toBe('4500900');
  });
});
