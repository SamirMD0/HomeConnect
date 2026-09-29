import { afterAll, describe, expect, it } from 'vitest';
import net from 'net';
import { configuredDatabaseUrl, preflightDatabaseConnection } from './database-preflight';

describe('database startup preflight', () => {
  const servers: net.Server[] = [];
  afterAll(async () => {
    await Promise.all(servers.map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
  });

  it('uses an explicit database URL before a missing configuration file', () => {
    expect(configuredDatabaseUrl('not-present.env', 'postgresql://user:secret@localhost:5433/test'))
      .toBe('postgresql://user:secret@localhost:5433/test');
  });

  it('leaves invalid or missing URLs to the normal backend diagnostics', async () => {
    expect(await preflightDatabaseConnection(null)).toBe('unknown');
    expect(await preflightDatabaseConnection('not-a-url')).toBe('unknown');
  });

  it('recognizes an accepting PostgreSQL endpoint and a definite refusal', async () => {
    const server = net.createServer();
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Expected TCP address');
    const url = `postgresql://user:secret@127.0.0.1:${address.port}/test`;
    expect(await preflightDatabaseConnection(url)).toBe('reachable');
    await new Promise<void>((resolve) => server.close(() => resolve()));
    servers.splice(servers.indexOf(server), 1);
    expect(await preflightDatabaseConnection(url)).toBe('refused');
  });
});
