import { afterEach, describe, expect, it } from 'vitest';
import { requireEnv } from './env';

const originalJwtSecret = process.env.JWT_SECRET;

afterEach(() => {
  if (originalJwtSecret === undefined) {
    delete process.env.JWT_SECRET;
  } else {
    process.env.JWT_SECRET = originalJwtSecret;
  }
});

describe('requireEnv', () => {
  it('returns a configured environment variable unchanged', () => {
    process.env.JWT_SECRET = '  configured-secret  ';

    expect(requireEnv('JWT_SECRET')).toBe('  configured-secret  ');
  });

  it('throws an actionable error when the environment variable is missing', () => {
    delete process.env.JWT_SECRET;

    expect(() => requireEnv('JWT_SECRET')).toThrow(
      'Missing required environment variable JWT_SECRET. Run Setup-HomeConnect.ps1',
    );
  });

  it('throws an actionable error when the environment variable is blank', () => {
    process.env.JWT_SECRET = '   ';

    expect(() => requireEnv('JWT_SECRET')).toThrow(
      'Missing required environment variable JWT_SECRET. Run Setup-HomeConnect.ps1',
    );
  });
});
