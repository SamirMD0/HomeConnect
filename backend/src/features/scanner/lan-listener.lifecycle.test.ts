import http from 'http';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Bind a port of this test's own rather than the real 3011.
 *
 * This is the only test that opens a real socket, and on a developer machine
 * the actual scanner may well be running — a shop PC with LAN mode enabled
 * holds 3011 for real. Sharing the port made the suite fail for an entirely
 * environmental reason. Hoisted so the env var is set before the listener
 * module reads it at import time.
 */
vi.hoisted(() => { process.env.SCANNER_LAN_PORT = '34011'; });

vi.mock('../service/products/products.service', () => ({ ProductsService: { scanLookup: vi.fn() } }));
vi.mock('../../lib/prisma', () => ({ prisma: { $queryRaw: vi.fn() }, transactionModel: {}, activityLogModel: {} }));

import {
  isLanListenerRunning,
  lanListenerStatus,
  SCANNER_LAN_PORT,
  startLanListener,
  stopLanListener,
} from './lan-listener';
import { ScannerService } from './scanner.service';
import { scannerStore } from './scanner.store';

/**
 * The one test that binds a real socket.
 *
 * Everything else drives the LAN app object through supertest, which never
 * opens a port. Start/stop, port contention, and clean shutdown cannot be
 * proven that way, and those are exactly the failures that would strand a port
 * bound on the business PC.
 */
afterEach(async () => {
  await stopLanListener();
  scannerStore.reset();
});

describe('LAN listener lifecycle', () => {
  it('starts, serves the page, and stops cleanly', async () => {
    const status = await startLanListener();
    expect(status.mode).toBe('AVAILABLE');
    expect(isLanListenerRunning()).toBe(true);

    const body = await get(`http://127.0.0.1:${SCANNER_LAN_PORT}/mobile-scanner`);
    expect(body).toContain('HomeConnect Scanner');

    const stopped = await stopLanListener();
    expect(stopped.mode).toBe('DISABLED');
    expect(isLanListenerRunning()).toBe(false);
    await expect(get(`http://127.0.0.1:${SCANNER_LAN_PORT}/mobile-scanner`)).rejects.toThrow();
  });

  it('is idempotent when enabled twice', async () => {
    const first = await startLanListener();
    const second = await startLanListener();
    expect(first.mode).toBe('AVAILABLE');
    expect(second.mode).toBe('AVAILABLE');
  });

  it('is idempotent when disabled without ever starting', async () => {
    expect((await stopLanListener()).mode).toBe('DISABLED');
  });

  /**
   * A barcode convenience must never be able to take the backend down. A port
   * conflict has to degrade into an ERROR status, not an unhandled rejection.
   */
  it('reports a port conflict as an error instead of crashing', async () => {
    const squatter = http.createServer();
    await new Promise<void>((resolve) => squatter.listen(SCANNER_LAN_PORT, '0.0.0.0', resolve));

    try {
      const status = await startLanListener();
      expect(status.mode).toBe('ERROR');
      expect(status.error).toContain('already in use');
      expect(isLanListenerRunning()).toBe(false);
    } finally {
      await new Promise<void>((resolve) => squatter.close(() => resolve()));
    }
  });

  it('revokes every paired phone when LAN mode is turned off', async () => {
    await startLanListener();
    const { code } = ScannerService.createPairingCode('user-1');
    const { token } = ScannerService.pairScanner({ code, deviceLabel: 'Shop phone', ipAddress: '192.168.1.50' });
    expect(ScannerService.touchSession(token)).not.toBeNull();

    await stopLanListener();
    expect(ScannerService.touchSession(token)).toBeNull();
  });

  it('reports addresses only while the listener is up', async () => {
    expect(lanListenerStatus().addresses).toEqual([]);
    await startLanListener();
    // The URL list is derived from the address list, whatever this machine has.
    const status = lanListenerStatus();
    expect(status.urls).toHaveLength(status.addresses.length);
    for (const url of status.urls) expect(url).toContain('/mobile-scanner');
  });

  it('always carries firewall guidance, since the port is useless while blocked', () => {
    const { firewall } = lanListenerStatus();
    expect(firewall.command).toContain('New-NetFirewallRule');
    expect(firewall.command).toContain(String(SCANNER_LAN_PORT));
    expect(firewall.note).toContain('Private');
  });
});

function get(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve(body));
    });
    req.on('error', reject);
    req.setTimeout(2_000, () => req.destroy(new Error('timed out')));
  });
}
