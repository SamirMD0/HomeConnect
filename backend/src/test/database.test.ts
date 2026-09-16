import { describe, expect, it } from 'vitest';
import { isIsolatedTestDatabase } from './database';

describe('database integration gate', () => {
  it.each(['homeconnect_test_phase4_phase5_phase6', 'homeconnect_ci_phase4_phase5_phase6'])(
    'enables all new database suites for %s', (name) => {
      expect(isIsolatedTestDatabase(`postgresql://localhost/${name}`)).toBe(true);
    }
  );
  it.each([undefined, '', 'invalid', 'postgresql://localhost/homeconnect', 'postgresql://localhost/contest', 'postgresql://localhost/city'])(
    'fails closed for %s', (url) => expect(isIsolatedTestDatabase(url)).toBe(false)
  );
});
