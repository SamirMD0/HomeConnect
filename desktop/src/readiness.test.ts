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

    const start = Date.now();
    await expect(waitForUrl(`http://127.0.0.1:${address.port}`, 10_000, 'backend')).rejects.toThrow(
      'DATABASE_UNAVAILABLE'
    );
    const duration = Date.now() - start;
    expect(duration).toBeLessThan(1000); // Fast fail should happen quickly, not 10_000ms

    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('does not fast-fail on generic 503 responses', async () => {
    const server = http.createServer((_req, res) => {
      res.writeHead(503, { 'Content-Type': 'text/plain' });
      res.end('Service Unavailable');
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Unexpected server address');

    const start = Date.now();
    await expect(waitForUrl(`http://127.0.0.1:${address.port}`, 50, 'backend')).rejects.toThrow(
      'Service Unavailable'
    );
    const duration = Date.now() - start;
    expect(duration).toBeGreaterThanOrEqual(50); // Did not fast fail

    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
});
