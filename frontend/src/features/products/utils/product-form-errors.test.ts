import { describe, expect, it } from 'vitest';
import { firstUnrenderedProductFieldError } from './product-form-errors';

describe('product form error visibility', () => {
  it('promotes an error whose field is not currently rendered', () => {
    expect(firstUnrenderedProductFieldError(
      { customInstallmentMonths: 'Required when custom pricing is enabled' },
      new Set(['name', 'model', 'costPrice'])
    )).toBe('Required when custom pricing is enabled');
  });

  it('does not duplicate errors already shown next to an input', () => {
    expect(firstUnrenderedProductFieldError({ costPrice: 'Cost is required' }, new Set(['costPrice']))).toBeNull();
  });
});
