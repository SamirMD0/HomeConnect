import http from 'http';
import { describe, expect, it } from 'vitest';
import { waitForUrl } from './readiness';

describe('Electron readiness checks', () => {
  it('resolves when a local service becomes reachable', async () => {
    const server = http.createServer((_req, res) => res.end('ok'));
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Unexpected server address');

    await expect(waitForUrl(`http://127.0.0.1:${address.port}`, 1000, 'test service')).resolves.toBeUndefined();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('rejects with a clear timeout message', async () => {
    await expect(waitForUrl('http://127.0.0.1:9', 50, 'missing service')).rejects.toThrow(
      'missing service did not become ready'
    );
  });

  it('includes the last HTTP error response in timeout messages', async () => {
    const server = http.createServer((_req, res) => {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: false,
        error: {
          code: 'DATABASE_UNAVAILABLE',
          message: 'Database connection failed. Confirm local PostgreSQL is running.',
        },
      }));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Unexpected server address');

    await expect(waitForUrl(`http://127.0.0.1:${address.port}`, 50, 'backend')).rejects.toThrow(
      'DATABASE_UNAVAILABLE'
    );
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
});
