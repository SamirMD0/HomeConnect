import { describe, expect, it } from 'vitest';
import { describeStartupFailure, startupFailureText } from './startup-failure-messages';

/** Every mapping must produce an action, not just a description. */
const expectActionable = (raw: string) => {
  const failure = describeStartupFailure(new Error(raw));
  expect(failure.fix.length).toBeGreaterThan(20);
  expect(failure.summary.length).toBeGreaterThan(10);
  return failure;
};

describe('startup failure messages', () => {
  it('turns DATABASE_UNAVAILABLE into a service instruction', () => {
    const failure = expectActionable('DATABASE_UNAVAILABLE');
    expect(failure.step).toBe('step-db');
    expect(failure.fix).toContain('postgresql-x64');
  });

  it('turns a readiness timeout into a database hint rather than a stopwatch', () => {
    const failure = expectActionable('Backend did not become ready within 45s');
    expect(failure.step).toBe('step-backend');
    expect(failure.fix).toContain('PostgreSQL');
  });

  it('explains a missing configuration file', () => {
    const failure = expectActionable('Configuration file not found at C:/config/production.env');
    expect(failure.step).toBe('step-config');
    expect(failure.fix).toContain('Setup-HomeConnect.ps1');
  });

  it('gives the %40 hint for an unencoded password', () => {
    expect(expectActionable('ERR_INVALID_URL').fix).toContain('%40');
  });

  it('reassures that data is safe when the database is absent', () => {
    const failure = expectActionable('database "homeconnect" does not exist');
    expect(failure.step).toBe('step-db');
    expect(failure.fix).toContain('not affected');
  });

  it('points a schema drift error at Maintenance', () => {
    const failure = expectActionable('P2022: column payment_allocations.voidedAt does not exist');
    expect(failure.fix).toContain('Maintenance');
  });

  it('explains a busy port in terms of other windows', () => {
    const failure = expectActionable('listen EADDRINUSE: address already in use :::3001');
    expect(failure.step).toBe('step-backend');
    expect(failure.fix).toContain('Close any other HomeConnect');
  });

  it('handles a rejected password', () => {
    expect(expectActionable('password authentication failed for user "postgres"').step).toBe('step-db');
  });

  it('falls back to something actionable for an unrecognised error', () => {
    const failure = expectActionable('something nobody anticipated');
    expect(failure.fix).toContain('Copy Diagnostics');
  });

  it('keeps the raw text for diagnostics', () => {
    expect(describeStartupFailure(new Error('DATABASE_UNAVAILABLE')).raw).toBe('DATABASE_UNAVAILABLE');
  });

  it('survives a non-Error being thrown', () => {
    expect(describeStartupFailure('plain string').raw).toBe('plain string');
    expect(describeStartupFailure(undefined).summary.length).toBeGreaterThan(0);
  });

  it('joins summary and fix into one line for the dialog', () => {
    const failure = describeStartupFailure(new Error('DATABASE_UNAVAILABLE'));
    expect(startupFailureText(failure)).toBe(`${failure.summary} ${failure.fix}`);
  });

  it('never leaves a fix empty for any rule', () => {
    const samples = [
      'production.env missing', 'JWT_SECRET is missing', 'ERR_INVALID_URL', 'ECONNREFUSED',
      'database "x" does not exist', 'password authentication failed', 'P2022',
      'EADDRINUSE', 'backend fast-failed', 'did not become ready', 'frontend failed to load', 'mystery',
    ];
    for (const sample of samples) {
      expect(describeStartupFailure(new Error(sample)).fix.trim()).not.toBe('');
    }
  });
});
