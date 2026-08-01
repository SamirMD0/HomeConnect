import { describe, expect, it } from 'vitest';
import { normalizeProductSpecifications, serializedSpecificationsSize } from './product-specifications';

describe('product specifications', () => {
  it('trims entries and drops incomplete pairs while preserving order', () => {
    expect(normalizeProductSpecifications([
      { label: ' Capacity ', value: ' 600 L ' },
      { label: '', value: 'ignored' },
      { label: 'Color', value: 'Silver' },
    ])).toEqual([{ label: 'Capacity', value: '600 L' }, { label: 'Color', value: 'Silver' }]);
  });

  it('measures serialized UTF-8 bytes', () => {
    expect(serializedSpecificationsSize([{ label: 'A', value: 'B' }])).toBeGreaterThan(2);
  });
});
