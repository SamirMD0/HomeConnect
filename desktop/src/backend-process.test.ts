import path from 'path';
import { describe, expect, it } from 'vitest';
import { buildBackendEnvironment, buildBackendSpawnConfig, redactLogChunk, pipeChildOutput } from './backend-process';

const comparablePath = (value: string) => {
  const resolved = path.resolve(value);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
};

describe('Electron backend process configuration', () => {
  it('uses localhost-only runtime configuration and credentialed CORS origins', () => {
    const env = buildBackendEnvironment('C:/Users/User/AppData/Roaming/HomeConnect');

    expect(env.HOST).toBe('127.0.0.1');
    expect(env.PORT).toBe('3001');
    expect(env.FRONTEND_URL).toBe('http://127.0.0.1:3002');
    expect(env.CORS_ORIGINS).toContain('http://localhost:3002');
    expect(env.CORS_ORIGINS).toContain('http://127.0.0.1:3002');
    expect(env.COOKIE_SECURE).toBe('false');
  });

  it('places writable config and logs under Electron userData', () => {
    const userData = 'C:/Users/User/AppData/Roaming/HomeConnect';
    const originalBackendEnvFile = process.env.BACKEND_ENV_FILE;
    delete process.env.BACKEND_ENV_FILE;

    try {
      const env = buildBackendEnvironment(userData);

      expect(comparablePath(env.HOME_CONNECT_USER_DATA!)).toBe(comparablePath(userData));
      expect(comparablePath(env.HOME_CONNECT_CONFIG_DIR!)).toBe(comparablePath(path.join(userData, 'config')));
      expect(comparablePath(env.LOG_DIR!)).toBe(comparablePath(path.join(userData, 'logs')));
      expect(comparablePath(env.BACKEND_ENV_FILE!)).toBe(comparablePath(path.join(userData, 'config', 'production.env')));
    } finally {
      if (originalBackendEnvFile === undefined) delete process.env.BACKEND_ENV_FILE;
      else process.env.BACKEND_ENV_FILE = originalBackendEnvFile;
    }
  });

  it('builds backend spawn arguments without shell execution', () => {
    const config = buildBackendSpawnConfig('dist/server/backend/src/index.js', 'C:/UserData/HomeConnect');

    expect(config.command).toBe(process.execPath);
    expect(config.args).toEqual(['dist/server/backend/src/index.js']);
    expect(config.options.shell).toBe(false);
    expect(config.options.env?.ELECTRON_RUN_AS_NODE).toBe('1');
    expect(JSON.stringify(config.args)).not.toContain('DATABASE_URL');
    expect(JSON.stringify(config.args)).not.toContain('JWT_SECRET');
  });

  it('redacts secrets from backend child output', () => {
    const input =
      'DATABASE_URL=postgresql://postgres:secret@localhost:5433/homeconnect JWT_SECRET=my-secret PGPASSWORD=pass';

    const redacted = redactLogChunk(input);

    expect(redacted).toContain('DATABASE_URL=[REDACTED]');
    expect(redacted).toContain('JWT_SECRET=[REDACTED]');
    expect(redacted).toContain('PGPASSWORD=[REDACTED]');
    expect(redacted).not.toContain('secret@localhost');
    expect(redacted).not.toContain('my-secret');
    expect(redacted).not.toContain('PGPASSWORD=pass');
  });
  it('calls onOutput callback with redacted logs', () => {
    let capturedLog = '';
    const mockChild = {
      stdout: { on: (event: string, cb: any) => { if (event === 'data') cb('DATABASE_URL=postgresql://secret@host/db starting'); } },
      stderr: { on: () => {} },
    } as unknown as import('child_process').ChildProcess;

    pipeChildOutput(mockChild, (log: string) => {
      capturedLog = log;
    });

    expect(capturedLog).toContain('[backend] DATABASE_URL=[REDACTED] starting');
  });
});
