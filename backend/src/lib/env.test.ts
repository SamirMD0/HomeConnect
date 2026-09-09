import { afterEach, describe, expect, it } from 'vitest';
import { requireEnv, requireSecretEnv } from './env';

const originalJwtSecret = process.env.JWT_SECRET;

afterEach(() => {
  if (originalJwtSecret === undefined) {
    delete process.env.JWT_SECRET;
  } else {
    process.env.JWT_SECRET = originalJwtSecret;
  }
});

describe('requireSecretEnv', () => {
  it('accepts a strong setup-generated-length secret', () => {
    process.env.JWT_SECRET = 'a'.repeat(64);
    expect(requireSecretEnv('JWT_SECRET')).toHaveLength(64);
  });

  it('rejects a weak legacy value with an actionable upgrade path', () => {
    process.env.JWT_SECRET = 'short-secret';
    expect(() => requireSecretEnv('JWT_SECRET')).toThrow(
      'JWT_SECRET must be at least 32 characters. Re-run Setup-HomeConnect.ps1',
    );
  });
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
