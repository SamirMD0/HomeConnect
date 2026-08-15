import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { activityEvents } from './AuthContext';

const contextSource = fs.readFileSync(path.resolve(__dirname, 'AuthContext.tsx'), 'utf8');
const authServiceSource = fs.readFileSync(
  path.resolve(__dirname, '../../../backend/src/services/auth.service.ts'),
  'utf8'
);

/**
 * The session length is set in two independent places, and the shop is signed
 * out by whichever expires first. They are asserted together so raising one
 * without the other cannot quietly keep the old behaviour.
 */
describe('session length', () => {
  it('signs out after an hour of inactivity, not fifteen minutes', () => {
    expect(contextSource).toContain('const INACTIVITY_TIMEOUT_MS = 60 * 60 * 1000;');
  });

  it('issues access tokens that last an hour by default', () => {
    // backend/.env is excluded from the installer, so this default is what the
    // packaged app actually runs on.
    expect(authServiceSource).toContain("process.env.JWT_ACCESS_EXPIRY || '1h'");
  });

  it('keeps the refresh window far longer than the access token', () => {
    expect(authServiceSource).toContain("process.env.JWT_REFRESH_EXPIRY || '7d'");
  });
});

describe('activity detection', () => {
  it('counts wheel and scroll, so reading a long table is not idleness', () => {
    expect(activityEvents).toContain('wheel');
    expect(activityEvents).toContain('scroll');
  });

  it('still counts pointer and keyboard input', () => {
    expect(activityEvents).toContain('mousedown');
    expect(activityEvents).toContain('keydown');
    expect(activityEvents).toContain('touchstart');
  });

  /**
   * A scroll inside a table or dialog never reaches the window during the
   * bubble phase, so without capture the operator reading a ledger looked idle.
   */
  it('listens in the capture phase', () => {
    expect(contextSource).toContain('capture: true');
    expect(contextSource).toMatch(/addEventListener\(event, resetInactivityTimer, ACTIVITY_LISTENER_OPTIONS\)/);
  });

  it('registers the listeners passively so scrolling is never blocked', () => {
    expect(contextSource).toContain('passive: true');
  });

  it('removes listeners with the same options it added them with', () => {
    // A capture listener removed without the capture flag stays attached.
    expect(contextSource).toMatch(/removeEventListener\(event, resetInactivityTimer, ACTIVITY_LISTENER_OPTIONS\)/);
  });
});
