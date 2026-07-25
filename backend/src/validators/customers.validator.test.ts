import { describe, expect, it } from 'vitest';
import { customerQuerySchema } from './customers.validator';

describe('customerQuerySchema', () => {
  it('coerces page and limit query strings to numbers', () => {
    const result = customerQuerySchema.parse({
      page: '1',
      limit: '20',
      search: 'Ali',
    });

    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
    expect(result.search).toBe('Ali');
  });

  it('uses defaults when pagination values are omitted', () => {
    const result = customerQuerySchema.parse({});

    expect(result.page).toBe(1);
    expect(result.limit).toBe(10);
    expect(result.sortBy).toBe('createdAt');
    expect(result.sortOrder).toBe('desc');
  });

  it('rejects invalid pagination values', () => {
    expect(() => customerQuerySchema.parse({ page: '0' })).toThrow();
    expect(() => customerQuerySchema.parse({ limit: '-1' })).toThrow();
    expect(() => customerQuerySchema.parse({ limit: '101' })).toThrow();
  });
});
