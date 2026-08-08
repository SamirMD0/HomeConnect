import { describe, expect, it } from 'vitest';
import { LocalStatus } from '../types/system.types';
import {
  DISCONNECT_FAILURE_THRESHOLD,
  POLL_INTERVAL_BLURRED_MS,
  POLL_INTERVAL_FOCUSED_MS,
  resolveDatabaseSignal,
  resolvePollInterval,
  shouldShowDisconnected,
} from './status-polling';

const status: LocalStatus = {
  backend: 'UP',
  database: 'CONNECTED',
  lanScanner: { mode: 'DISABLED' },
  appVersion: '1.6.0',
  serverTime: '2026-08-07T10:00:00.000Z',
};

describe('resolvePollInterval', () => {
  it('polls fastest while the window is in front', () => {
    expect(resolvePollInterval('focused')).toBe(POLL_INTERVAL_FOCUSED_MS);
  });

  it('backs off when the window is behind another', () => {
    expect(resolvePollInterval('blurred')).toBe(POLL_INTERVAL_BLURRED_MS);
    expect(POLL_INTERVAL_BLURRED_MS).toBeGreaterThan(POLL_INTERVAL_FOCUSED_MS);
  });

  it('stops entirely when nobody can see the chips', () => {
    expect(resolvePollInterval('hidden')).toBe(false);
  });
});

describe('shouldShowDisconnected', () => {
  it('tolerates a single missed poll', () => {
    expect(shouldShowDisconnected(0)).toBe(false);
    expect(shouldShowDisconnected(1)).toBe(false);
  });

  it('reports disconnected once failures are consecutive', () => {
    expect(shouldShowDisconnected(DISCONNECT_FAILURE_THRESHOLD)).toBe(true);
    expect(shouldShowDisconnected(DISCONNECT_FAILURE_THRESHOLD + 5)).toBe(true);
  });
});

describe('resolveDatabaseSignal', () => {
  it('passes the backend answer through while the backend is reachable', () => {
    expect(resolveDatabaseSignal(status, true)).toBe('CONNECTED');
    expect(resolveDatabaseSignal({ ...status, database: 'UNAVAILABLE' }, true)).toBe('UNAVAILABLE');
  });

  it('refuses to claim a database state once the backend is unreachable', () => {
    expect(resolveDatabaseSignal(status, false)).toBe('UNKNOWN');
  });

  it('is unknown before the first successful poll', () => {
    expect(resolveDatabaseSignal(undefined, true)).toBe('UNKNOWN');
  });
});
