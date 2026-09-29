import { Prisma } from '@prisma/client';
import { prisma } from '../../../lib/prisma';

export type FinancialTransactionClient = Prisma.TransactionClient;

export interface TransactionRetryOptions {
  maxRetries?: number;
  isRetryable?: (error: unknown) => boolean;
  retryDelayMs?: (attempt: number) => number;
}

export async function retrySerializableTransaction<T>(
  operation: (attempt: number) => Promise<T>,
  options: TransactionRetryOptions = {}
): Promise<T> {
  const maxRetries = options.maxRetries ?? 4;
  const isRetryable = options.isRetryable ?? isRetryableTransactionError;
  const retryDelayMs = options.retryDelayMs ?? defaultRetryDelayMs;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      if (attempt >= maxRetries || !isRetryable(error)) {
        throw error;
      }
      await delay(retryDelayMs(attempt));
    }
  }

  throw new Error('Unreachable transaction retry state');
}

export async function runFinancialTransaction<T>(
  operation: (tx: FinancialTransactionClient) => Promise<T>,
  options: TransactionRetryOptions = {}
): Promise<T> {
  return retrySerializableTransaction(
    () =>
      prisma.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      }),
    options
  );
}

export function isRetryableTransactionError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034';
}

function defaultRetryDelayMs(attempt: number): number {
  const exponentialDelay = Math.min(25 * (2 ** attempt), 250);
  return exponentialDelay + Math.floor(Math.random() * 25);
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, milliseconds)));
}
