import { describe, expect, it } from 'vitest';
import { assertHostedModeEnv } from './hosted-mode-preflight';

const valid = {
  HOSTED_MODE: 'true',
  DATABASE_URL: 'postgresql://example',
  JWT_SECRET: 'access-secret',
  JWT_REFRESH_SECRET: 'refresh-secret',
  FRONTEND_URL: 'http://127.0.0.1:3002',
  COOKIE_SECURE: 'true',
  HOST: '0.0.0.0',
};

describe('assertHostedModeEnv', () => {
  it('is a no-op outside hosted mode', () => {
    expect(() => assertHostedModeEnv({ HOSTED_MODE: 'false' })).not.toThrow();
  });
  it('accepts complete hosted configuration', () => {
    expect(() => assertHostedModeEnv(valid)).not.toThrow();
  });
  it('lists a missing required variable', () => {
    expect(() => assertHostedModeEnv({ ...valid, DATABASE_URL: '' })).toThrow('DATABASE_URL');
  });
  it('requires secure cookies in hosted mode', () => {
    expect(() => assertHostedModeEnv({ ...valid, COOKIE_SECURE: 'false' })).toThrow('COOKIE_SECURE=true');
  });
});
