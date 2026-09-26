import { describe, expect, it } from 'vitest';
import { parseManualDiscountStages } from './discount-stages';

describe('manual discount stages', () => {
  it('parses whole-number percentage steps', () => {
    expect(parseManualDiscountStages('7, 2, 1')).toEqual([7, 2, 1]);
    expect(parseManualDiscountStages('2,2,2,2,1')).toEqual([2, 2, 2, 2, 1]);
  });

  it('rejects empty, fractional, zero, negative, and oversized input', () => {
    for (const value of ['', '2.5, 1', '0, 2', '-1, 2', '100, 1']) {
      expect(parseManualDiscountStages(value)).toBeNull();
    }
  });
});
