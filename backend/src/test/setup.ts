import { vi } from 'vitest';

/**
 * Route contract tests use signed synthetic users and mock only the feature
 * dependencies they exercise. User-session enforcement has dedicated tests,
 * so keep those route tests isolated from the database lookup added to the
 * shared authentication middleware.
 *
 * Security-focused tests explicitly unmock this module and exercise the real
 * cache, database status lookup, and revocation behavior.
 */
vi.mock('../lib/user-session-status', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/user-session-status')>();
  return {
    ...actual,
    requireActiveUserSession: vi.fn().mockResolvedValue({ role: 'EMPLOYEE' }),
  };
});
