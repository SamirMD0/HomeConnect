import { describe, expect, it } from 'vitest';
import {
  canonicalMoneyInput,
  isMoneyLessThanOrEqual,
  isValidMoneyInput,
  moneyToCents,
  sanitizeMoneyInput,
} from './money-input';

describe('money input helpers', () => {
  it('accepts only positive decimal strings with up to two decimals', () => {
    expect(isValidMoneyInput('600')).toBe(true);
    expect(isValidMoneyInput('600.00')).toBe(true);
    expect(isValidMoneyInput('0.01')).toBe(true);
    expect(isValidMoneyInput('0.00')).toBe(false);
    expect(isValidMoneyInput('-1.00')).toBe(false);
    expect(isValidMoneyInput('1e3')).toBe(false);
    expect(isValidMoneyInput('1.234')).toBe(false);
  });

  it('canonicalizes and compares without floating-point arithmetic', () => {
    expect(canonicalMoneyInput('600')).toBe('600.00');
    expect(canonicalMoneyInput('600.5')).toBe('600.50');
    expect(moneyToCents('999999999999.99')).toBe(99999999999999n);
    expect(isMoneyLessThanOrEqual('400.00', '400.00')).toBe(true);
    expect(isMoneyLessThanOrEqual('400.01', '400.00')).toBe(false);
  });

  it('sanitizes accidental currency characters without locale conversion', () => {
    expect(sanitizeMoneyInput('$600.257')).toBe('600.25');
    expect(sanitizeMoneyInput('12.3.4')).toBe('12.34');
  });
});
