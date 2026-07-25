import { Prisma } from '@prisma/client';
import { prisma } from '../../../lib/prisma';

export type FinancialTransactionClient = Prisma.TransactionClient;

export interface TransactionRetryOptions {
  maxRetries?: number;
  isRetryable?: (error: unknown) => boolean;
}

export async function retrySerializableTransaction<T>(
  operation: (attempt: number) => Promise<T>,
  options: TransactionRetryOptions = {}
): Promise<T> {
  const maxRetries = options.maxRetries ?? 2;
  const isRetryable = options.isRetryable ?? isRetryableTransactionError;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      if (attempt >= maxRetries || !isRetryable(error)) {
        throw error;
      }
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
