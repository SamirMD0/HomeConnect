import bcrypt from 'bcrypt';
import { AdminVerificationOutcome, Prisma, Role } from '@prisma/client';
import { AuthenticationError, AuthorizationError } from './errors';
import { prisma } from './prisma';

const VERIFICATION_WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILED_ATTEMPTS = 5;

export interface AdminPasswordContext {
  action: string;
  recordType?: string;
  recordId?: string;
  ipAddress?: string | null;
  domainLabel?: string;
}

export interface AdminVerificationAttempt {
  userId: string;
  attemptedAt: number;
  outcome: AdminVerificationOutcome;
  action: string;
  ipAddress: string | null;
}

const attempts: AdminVerificationAttempt[] = [];

export async function verifyAdminPassword(
  userId: string,
  password: string,
  context: AdminPasswordContext,
  tx?: Prisma.TransactionClient
): Promise<void> {
  const client = tx ?? prisma;
  const now = Date.now();
  pruneOldAttempts(now);

  if (isLocked(userId, now)) {
    await recordAttempt({
      userId,
      attemptedAt: now,
      outcome: AdminVerificationOutcome.LOCKED,
      action: context.action,
      ipAddress: context.ipAddress ?? null,
    }, tx);
    throw new AuthenticationError('Too many failed correction password attempts. Try again later.');
  }

  const user = await client.user.findUnique({
    where: { id: userId },
    select: { password: true, role: true, deletedAt: true, isActive: true },
  });

  if (!user || user.deletedAt || !user.isActive) {
    await recordFailure(userId, now, context, tx);
    throw new AuthenticationError('Account password could not be verified');
  }

  if (user.role !== Role.ADMIN) {
    await recordFailure(userId, now, context, tx);
    throw new AuthorizationError(
      `Only administrators can perform ${context.domainLabel ?? 'financial corrections'}`
    );
  }

  if (!(await bcrypt.compare(password, user.password))) {
    await recordFailure(userId, now, context, tx);
    throw new AuthenticationError('Account password is incorrect');
  }

  await recordAttempt({
    userId,
    attemptedAt: now,
    outcome: AdminVerificationOutcome.SUCCESS,
    action: context.action,
    ipAddress: context.ipAddress ?? null,
  }, tx);
}

export function resetAdminPasswordAttemptsForTests(): void {
  attempts.length = 0;
}

export function getAdminPasswordAttemptsForTests(): AdminVerificationAttempt[] {
  return [...attempts];
}

async function recordFailure(
  userId: string,
  attemptedAt: number,
  context: AdminPasswordContext,
  tx?: Prisma.TransactionClient
): Promise<void> {
  await recordAttempt({
    userId,
    attemptedAt,
    outcome: AdminVerificationOutcome.FAILURE,
    action: context.action,
    ipAddress: context.ipAddress ?? null,
  }, tx);
}

async function recordAttempt(
  attempt: AdminVerificationAttempt,
  tx?: Prisma.TransactionClient
): Promise<void> {
  attempts.push(attempt);
  await (tx ?? prisma).adminVerificationLog.create({
    data: {
      userId: attempt.userId,
      attemptedAt: new Date(attempt.attemptedAt),
      outcome: attempt.outcome,
      action: attempt.action,
      ipAddress: attempt.ipAddress,
    },
  });
}

function isLocked(userId: string, now: number): boolean {
  return attempts.filter(
    (attempt) =>
      attempt.userId === userId &&
      attempt.outcome === AdminVerificationOutcome.FAILURE &&
      now - attempt.attemptedAt <= VERIFICATION_WINDOW_MS
  ).length >= MAX_FAILED_ATTEMPTS;
}

function pruneOldAttempts(now: number): void {
  const firstRecentIndex = attempts.findIndex(
    (attempt) => now - attempt.attemptedAt <= VERIFICATION_WINDOW_MS
  );
  if (firstRecentIndex === -1) {
    attempts.length = 0;
  } else if (firstRecentIndex > 0) {
    attempts.splice(0, firstRecentIndex);
  }
}
