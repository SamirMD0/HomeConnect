import { describe, expect, it } from 'vitest';
import { recentSubmission, shouldSuppressDuplicate } from './duplicate-scan';

describe('duplicate scan suppression', () => {
  it('suppresses the same normalized code inside the short window', () => {
    const previous = recentSubmission(' hc-000001 ', 1_000);
    expect(shouldSuppressDuplicate(previous, 'HC-000001', 2_000)).toBe(true);
  });

  it('allows a different code immediately and the same code after the window', () => {
    const previous = recentSubmission('HC-000001', 1_000);
    expect(shouldSuppressDuplicate(previous, 'HC-000002', 1_100)).toBe(false);
    expect(shouldSuppressDuplicate(previous, 'HC-000001', 3_500)).toBe(false);
  });
});
