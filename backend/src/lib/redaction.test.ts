import { describe, expect, it } from 'vitest';
import { redactSensitiveData } from './redaction';

describe('redactSensitiveData', () => {
  it('redacts account passwords and nested secret values', () => {
    const redacted = redactSensitiveData({
      accountPassword: 'admin-password',
      details: {
        reason: 'Correct entered amount',
        jwtSecret: 'secret',
        nested: [{ currentPassword: 'old-password' }],
      },
    });

    expect(redacted).toEqual({
      accountPassword: '[REDACTED]',
      details: {
        reason: 'Correct entered amount',
        jwtSecret: '[REDACTED]',
        nested: [{ currentPassword: '[REDACTED]' }],
      },
    });
  });
});
