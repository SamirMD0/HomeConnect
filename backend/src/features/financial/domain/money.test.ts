import { Decimal } from '@prisma/client/runtime/library';
import { describe, expect, it } from 'vitest';
import { InvalidMoneyError } from './financial-errors';
import {
  addMoney,
  assertPositiveMoney,
  compareMoney,
  equalMoney,
  moneyToApiString,
  parseMoney,
  subtractMoney,
  sumMoney,
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
});
