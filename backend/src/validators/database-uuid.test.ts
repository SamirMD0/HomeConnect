import { describe, expect, it } from 'vitest';
import { databaseUuidSchema } from './database-uuid';

describe('database UUID validation', () => {
  const schema = databaseUuidSchema();

  it('accepts RFC UUIDs and canonical legacy PostgreSQL UUIDs', () => {
    expect(schema.parse('33333333-3333-4333-8333-333333333333')).toBe('33333333-3333-4333-8333-333333333333');
    expect(schema.parse('02880843-6f16-93fb-2ecc-091af51a07b4')).toBe('02880843-6f16-93fb-2ecc-091af51a07b4');
  });

  it('still rejects malformed or injected identifiers', () => {
    for (const value of ['not-a-uuid', '028808436f1693fb2ecc091af51a07b4', '../products', "' OR 1=1 --"]) {
      expect(() => schema.parse(value)).toThrow('Invalid ID');
    }
  });
});
