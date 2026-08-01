import { describe, expect, it } from 'vitest';
import { formatServiceJobNumber, nextServiceJobNumber } from './job-number';

describe('service job numbers', () => {
  it('formats and increments yearly sequences', () => {
    expect(formatServiceJobNumber(2026, 1)).toBe('SV-2026-0001');
    expect(nextServiceJobNumber(2026, 'SV-2026-0142')).toBe('SV-2026-0143');
    expect(nextServiceJobNumber(2027, 'SV-2026-0142')).toBe('SV-2027-0001');
  });
});
