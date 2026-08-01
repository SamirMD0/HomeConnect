import { Decimal } from '@prisma/client/runtime/library';
import { describe, expect, it } from 'vitest';
import { formatInternalPriceCode, formatStaffLabelCode } from './internal-price-code';

describe('internal price code', () => {
  it('rounds half up without exposing decimals', () => {
    expect(formatInternalPriceCode(new Decimal('352.85'))).toBe('P353');
    expect(formatInternalPriceCode(new Decimal('352.50'))).toBe('P353');
  });

  it('omits a code for zero', () => {
    expect(formatInternalPriceCode(new Decimal(0))).toBeNull();
  });

  it('combines SKU and the memory value without changing the canonical SKU', () => {
    expect(formatStaffLabelCode('HC-000003', 'P27')).toBe('HC-000003-K27Z');
  });
});
