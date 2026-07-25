import { describe, expect, it, vi } from 'vitest';
import { PaymentIdempotencyConflictError } from '../domain/financial-errors';
import {
  assertIdempotentReplay,
  createIdempotencyFingerprint,
  normalizeIdempotencyKey,
} from './idempotency';
import { retrySerializableTransaction } from './transaction';

describe('idempotency helpers', () => {
  it('normalizes valid keys and treats blank keys as absent', () => {
    expect(normalizeIdempotencyKey('  payment-key_123  ')).toBe('payment-key_123');
    expect(normalizeIdempotencyKey('   ')).toBeNull();
    expect(normalizeIdempotencyKey(undefined)).toBeNull();
  });

  it('rejects invalid keys', () => {
    expect(() => normalizeIdempotencyKey('short')).toThrow(PaymentIdempotencyConflictError);
    expect(() => normalizeIdempotencyKey('invalid key with spaces')).toThrow(
      PaymentIdempotencyConflictError
    );
  });

  it('creates stable fingerprints independent of object key order', () => {
    const first = createIdempotencyFingerprint({ amount: '10.00', target: { id: 'a', type: 'debt' } });
    const second = createIdempotencyFingerprint({ target: { type: 'debt', id: 'a' }, amount: '10.00' });
    expect(first).toBe(second);
  });

  it('allows same-key same-request replay and rejects same-key different-request conflicts', () => {
    const fingerprint = createIdempotencyFingerprint({ amount: '10.00' });
    expect(() =>
      assertIdempotentReplay({ existingFingerprint: fingerprint, incomingFingerprint: fingerprint })
    ).not.toThrow();

    expect(() =>
      assertIdempotentReplay({
        existingFingerprint: fingerprint,
        incomingFingerprint: createIdempotencyFingerprint({ amount: '11.00' }),
      })
    ).toThrow(PaymentIdempotencyConflictError);
  });
});

describe('transaction retry helper', () => {
  it('retries retryable transaction errors up to success', async () => {
    const operation = vi
      .fn<(_: number) => Promise<string>>()
      .mockRejectedValueOnce(new Error('serialization conflict'))
      .mockResolvedValueOnce('ok');

    await expect(
      retrySerializableTransaction(operation, {
        maxRetries: 2,
        isRetryable: () => true,
      })
    ).resolves.toBe('ok');
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('stops at the maximum retry limit', async () => {
    const operation = vi.fn<(_: number) => Promise<string>>().mockRejectedValue(new Error('retryable'));

    await expect(
      retrySerializableTransaction(operation, {
        maxRetries: 1,
        isRetryable: () => true,
      })
    ).rejects.toThrow('retryable');
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('does not retry non-retryable errors', async () => {
    const operation = vi.fn<(_: number) => Promise<string>>().mockRejectedValue(new Error('fatal'));

    await expect(
      retrySerializableTransaction(operation, {
        maxRetries: 3,
        isRetryable: () => false,
      })
    ).rejects.toThrow('fatal');
    expect(operation).toHaveBeenCalledTimes(1);
  });
});
