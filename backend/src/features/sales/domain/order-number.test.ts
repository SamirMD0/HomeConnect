import { describe, expect, it } from 'vitest';
import { formatSalesOrderNumber, nextSalesOrderNumber } from './order-number';

describe('sales order numbers', () => {
  it('formats and increments the yearly sequence', () => {
    expect(formatSalesOrderNumber(2026, 1)).toBe('SO-2026-0001');
    expect(nextSalesOrderNumber(2026, 'SO-2026-0099')).toBe('SO-2026-0100');
  });

  it('starts at one for a new year or malformed latest value', () => {
    expect(nextSalesOrderNumber(2027, 'SO-2026-0042')).toBe('SO-2027-0001');
    expect(nextSalesOrderNumber(2026, 'not-an-order')).toBe('SO-2026-0001');
    expect(nextSalesOrderNumber(2026, null)).toBe('SO-2026-0001');
  });

  it('rejects invalid years and sequences', () => {
    expect(() => formatSalesOrderNumber(1999, 1)).toThrow('Invalid sales order year');
    expect(() => formatSalesOrderNumber(2026, 0)).toThrow('Invalid sales order sequence');
  });
});
