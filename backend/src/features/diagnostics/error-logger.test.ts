import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { redactSecrets, logBackendError } from './error-logger';
import fs from 'fs';
import path from 'path';

vi.mock('fs');

describe('error-logger', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.FORCE_ERROR_LOG = '1'; // Bypass test check
  });

  afterEach(() => {
    delete process.env.FORCE_ERROR_LOG;
  });

  describe('redactSecrets', () => {
    it('redacts postgres passwords in URL strings', () => {
      const url = 'postgresql://user:secret123@localhost:5432/db';
      const redacted = redactSecrets(url);
      expect(redacted).toBe('postgresql://user:[REDACTED]@localhost:5432/db');
    });

    it('redacts DATABASE_URL in plain string', () => {
      const str = 'Error connecting: DATABASE_URL=postgresql://user:pass@host/db is invalid';
      const redacted = redactSecrets(str);
      expect(redacted).toBe('Error connecting: DATABASE_URL=[REDACTED] is invalid');
    });

    it('redacts JWT tokens', () => {
      const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIxMjM0NTY3ODkwIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
      const str = `Authorization: Bearer ${jwt}`;
      const redacted = redactSecrets(str);
      expect(redacted).toContain('[REDACTED]');
      expect(redacted).not.toContain(jwt);
    });

    it('redacts object properties containing secrets', () => {
      const data = {
        password: 'my-super-secret',
        jwtToken: 'token123',
        safeData: 'hello',
        nested: {
          authorization: 'Bearer token',
          cookie: 'session=abc',
        }
      };
      
      const redacted = redactSecrets(data);
      expect(redacted.password).toBe('[REDACTED]');
      expect(redacted.jwtToken).toBe('[REDACTED]');
      expect(redacted.safeData).toBe('hello');
      expect(redacted.nested.authorization).toBe('[REDACTED]');
      expect(redacted.nested.cookie).toBe('[REDACTED]');
    });
  });

  describe('logBackendError', () => {
    it('appends redacted error record to file', () => {
      const appendFileSyncMock = vi.mocked(fs.appendFileSync);
      const existsSyncMock = vi.mocked(fs.existsSync).mockReturnValue(true);

      const record = {
        method: 'POST',
        path: '/api/login',
        status: 500,
        message: 'Database connection failed postgresql://user:pass@localhost',
        stack: 'Error: Database connection failed postgresql://user:pass@localhost at file.js'
      };

      logBackendError(record);

      expect(appendFileSyncMock).toHaveBeenCalledTimes(1);
      const callArgs = appendFileSyncMock.mock.calls[0];
      const loggedData = JSON.parse(callArgs[1] as string);
      
      expect(loggedData.message).not.toContain('pass');
      expect(loggedData.message).toContain('[REDACTED]');
      expect(loggedData.stack).not.toContain('pass');
      expect(loggedData.appVersion).toBeDefined();
      expect(loggedData.timestamp).toBeDefined();
      expect(loggedData.method).toBe('POST');
    });
  });
});
