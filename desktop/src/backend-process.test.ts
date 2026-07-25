import path from 'path';
import { describe, expect, it } from 'vitest';
import { buildBackendEnvironment, buildBackendSpawnConfig, redactLogChunk } from './backend-process';

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
    const env = buildBackendEnvironment(userData);

    expect(env.HOME_CONNECT_USER_DATA).toBe(userData);
    expect(env.HOME_CONNECT_CONFIG_DIR).toBe(path.join(userData, 'config'));
    expect(env.LOG_DIR).toBe(path.join(userData, 'logs'));
    expect(env.BACKEND_ENV_FILE).toBe(path.join(userData, 'config', 'production.env'));
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
});
