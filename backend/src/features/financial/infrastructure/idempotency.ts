import { createHash } from 'crypto';
import { PaymentIdempotencyConflictError } from '../domain/financial-errors';

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;

export function normalizeIdempotencyKey(key: string | null | undefined): string | null {
  const normalized = key?.trim();
  if (!normalized) return null;

  if (!IDEMPOTENCY_KEY_PATTERN.test(normalized)) {
    throw new PaymentIdempotencyConflictError(
      'Idempotency key must be 8 to 128 safe ASCII characters'
    );
  }

  return normalized;
}

export function createIdempotencyFingerprint(payload: unknown): string {
  return createHash('sha256').update(stableStringify(payload)).digest('hex');
}

export function assertIdempotentReplay(input: {
  existingFingerprint: string;
  incomingFingerprint: string;
}): void {
  if (input.existingFingerprint !== input.incomingFingerprint) {
    throw new PaymentIdempotencyConflictError();
  }
}

export interface IdempotencyLookupResult<TResult> {
  fingerprint: string;
  result: TResult;
}

export interface IdempotencyRepositoryContract<TResult> {
  findByKey(key: string): Promise<IdempotencyLookupResult<TResult> | null>;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
    left.localeCompare(right)
  );

  return `{${entries
    .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
    .join(',')}}`;
}
