import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { productsMock, loggerMock, diagnosticsMock } = vi.hoisted(() => ({
  productsMock: { scanLookup: vi.fn() },
  loggerMock: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  diagnosticsMock: { logBackendError: vi.fn() },
}));
vi.mock('../service/products/products.service', () => ({ ProductsService: productsMock }));
vi.mock('../../lib/logger', () => ({ logger: loggerMock }));
vi.mock('../../features/diagnostics/error-logger', () => diagnosticsMock);
vi.mock('../../lib/prisma', () => ({ prisma: { $queryRaw: vi.fn() }, transactionModel: {}, activityLogModel: {} }));

import {
  buildLanApp, lastLanActivityAt, markLanActivity, resetLanListenerStateForTests,
  SCANNER_LAN_IDLE_MS, shouldAutoDisable,
} from './lan-listener';
import { resetRateLimits } from './scanner-rate-limit';
import { ScannerService } from './scanner.service';
import { scannerStore } from './scanner.store';

const app = buildLanApp();

const foundResult = {
  status: 'FOUND',
  normalizedCode: 'HC-000001',
  matchedBy: 'SKU',
  product: { id: 'product-1', name: 'Ceiling Fan', model: 'CF-52', sku: 'HC-000001', barcode: null, brand: null, isActive: true },
};

const issueCode = () => ScannerService.createPairingCode('user-1').code;

beforeEach(() => {
  scannerStore.reset();
  resetRateLimits();
  resetLanListenerStateForTests();
  vi.clearAllMocks();
  productsMock.scanLookup.mockResolvedValue(foundResult);
});

describe('idle auto-disable policy', () => {
  const T0 = Date.UTC(2026, 7, 7, 9, 0, 0);

  it('leaves a listener alone while it is being used', () => {
    expect(shouldAutoDisable(T0, T0 + SCANNER_LAN_IDLE_MS - 1_000)).toBe(false);
  });

  it('closes a listener once the idle window passes', () => {
    expect(shouldAutoDisable(T0, T0 + SCANNER_LAN_IDLE_MS)).toBe(true);
    expect(shouldAutoDisable(T0, T0 + SCANNER_LAN_IDLE_MS + 60_000)).toBe(true);
  });

  it('defaults to a shop day rather than an overnight window', () => {
    expect(SCANNER_LAN_IDLE_MS).toBe(8 * 60 * 60 * 1000);
  });

  it('treats any LAN request as activity, resetting the clock', async () => {
    markLanActivity(T0);
    expect(lastLanActivityAt()).toBe(T0);
    await request(app).get('/mobile-scanner');
    expect(lastLanActivityAt()).toBeGreaterThan(T0);
  });

  it('counts a rejected request as activity too, so an attack cannot look idle', async () => {
    markLanActivity(T0);
    await request(app).post('/api/v1/scanner/pair').send({ code: '000001' });
    expect(lastLanActivityAt()).toBeGreaterThan(T0);
  });
});

describe('LAN request logging', () => {
  const logLines = () => loggerMock.info.mock.calls.map((call) => String(call[0])).filter((line) => line.startsWith('[LAN]'));

  it('records method, path, status and address', async () => {
    await request(app).get('/mobile-scanner');
    const [line] = logLines();
    expect(line).toContain('GET /mobile-scanner');
    expect(line).toContain('- 200 -');
  });

  it('records a failed pairing attempt, so a burst is visible afterwards', async () => {
    issueCode();
    await request(app).post('/api/v1/scanner/pair').send({ code: '000001' });
    expect(logLines().some((line) => line.includes('POST /api/v1/scanner/pair') && line.includes('- 401 -'))).toBe(true);
  });

  /**
   * The log is the one artefact that outlives the in-memory session store, so
   * it must never be where a code or token ends up.
   */
  it('never writes the pairing code', async () => {
    const code = issueCode();
    await request(app).post('/api/v1/scanner/pair').send({ code, deviceLabel: 'Shop phone' });
    const everythingLogged = JSON.stringify(loggerMock.info.mock.calls.concat(loggerMock.warn.mock.calls));
    expect(everythingLogged).not.toContain(code);
  });

  it('never writes the session token', async () => {
    const paired = await request(app).post('/api/v1/scanner/pair').send({ code: issueCode() });
    const token = paired.body.data.token as string;
    await request(app).post('/api/v1/scanner/events').set('X-Scanner-Session', token).send({ code: 'HC-000001' });

    const everythingLogged = JSON.stringify(
      loggerMock.info.mock.calls.concat(loggerMock.warn.mock.calls, loggerMock.error.mock.calls)
    );
    expect(everythingLogged).not.toContain(token);
    expect(everythingLogged.toLowerCase()).not.toContain('x-scanner-session');
  });

  it('never writes a request body', async () => {
    await request(app).post('/api/v1/scanner/pair').send({ code: '424242', deviceLabel: 'Very Distinctive Label' });
    const everythingLogged = JSON.stringify(loggerMock.info.mock.calls);
    expect(everythingLogged).not.toContain('Very Distinctive Label');
    expect(everythingLogged).not.toContain('424242');
  });
});

describe('diagnostics log flooding', () => {
  /**
   * The scanner limiters are reachable from the shop Wi-Fi. Before this, every
   * rejection wrote a stack trace into the diagnostics log — a lever for burying
   * real failures under noise.
   */
  it('does not record rate-limited pairing attempts as backend errors', async () => {
    issueCode();
    for (let attempt = 0; attempt < 12; attempt += 1) {
      await request(app).post('/api/v1/scanner/pair').send({ code: '000001' });
    }
    const limited = await request(app).post('/api/v1/scanner/pair').send({ code: '000001' });
    expect(limited.status).toBe(429);

    const rateLimited = diagnosticsMock.logBackendError.mock.calls.filter((call) => call[0]?.status === 429);
    expect(rateLimited).toHaveLength(0);
  });

  it('still records a genuine server fault', async () => {
    const paired = await request(app).post('/api/v1/scanner/pair').send({ code: issueCode() });
    productsMock.scanLookup.mockRejectedValue(new Error('database exploded'));
    await request(app)
      .post('/api/v1/scanner/events')
      .set('X-Scanner-Session', paired.body.data.token)
      .send({ code: 'HC-000001' });
    expect(diagnosticsMock.logBackendError).toHaveBeenCalled();
  });
});

describe('error details', () => {
  it('never echoes the submitted code back in a validation error', async () => {
    const response = await request(app).post('/api/v1/scanner/pair').send({ code: '9'.repeat(40) });
    expect(response.status).toBe(400);
    expect(JSON.stringify(response.body)).not.toContain('9'.repeat(40));
  });
});
