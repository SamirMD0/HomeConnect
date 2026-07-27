import bcrypt from 'bcrypt';
import { AdminVerificationOutcome, Role } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { AuthenticationError, AuthorizationError } from '../../../lib/errors';

const CORRECTION_WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILED_CORRECTION_ATTEMPTS = 5;

export interface AdminCorrectionPasswordContext {
  action: string;
  recordType?: string;
  recordId?: string;
  ipAddress?: string | null;
}

interface AdminVerificationAttempt {
  userId: string;
  attemptedAt: number;
  outcome: AdminVerificationOutcome;
  action: string;
  ipAddress: string | null;
}

const adminVerificationAttempts: AdminVerificationAttempt[] = [];

export async function verifyAccountPassword(userId: string, accountPassword: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { password: true, deletedAt: true, isActive: true },
  });

  if (!user || user.deletedAt || !user.isActive) {
    throw new AuthenticationError('Account password could not be verified');
  }

  const isValidPassword = await bcrypt.compare(accountPassword, user.password);
  if (!isValidPassword) {
    throw new AuthenticationError('Account password is incorrect');
  }
}

export async function verifyAdminPasswordForCorrection(
  userId: string,
  accountPassword: string,
  context: AdminCorrectionPasswordContext
): Promise<void> {
  const now = Date.now();
  pruneOldAttempts(now);

  if (isCorrectionLocked(userId, now)) {
    await recordAttempt({
      userId,
      attemptedAt: now,
      outcome: AdminVerificationOutcome.LOCKED,
      action: context.action,
      ipAddress: context.ipAddress ?? null,
    });
    throw new AuthenticationError('Too many failed correction password attempts. Try again later.');
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      password: true,
      role: true,
      deletedAt: true,
      isActive: true,
    },
  });

  if (!user || user.deletedAt || !user.isActive) {
    await recordFailure(userId, now, context);
    throw new AuthenticationError('Account password could not be verified');
  }

  if (user.role !== Role.ADMIN) {
    await recordFailure(userId, now, context);
    throw new AuthorizationError('Only administrators can perform financial corrections');
  }

  const isValidPassword = await bcrypt.compare(accountPassword, user.password);
  if (!isValidPassword) {
    await recordFailure(userId, now, context);
    throw new AuthenticationError('Account password is incorrect');
  }

  await recordAttempt({
    userId,
    attemptedAt: now,
    outcome: AdminVerificationOutcome.SUCCESS,
    action: context.action,
    ipAddress: context.ipAddress ?? null,
  });
}

export function resetAdminCorrectionPasswordAttemptsForTests(): void {
  adminVerificationAttempts.length = 0;
}

export function getAdminCorrectionPasswordAttemptsForTests(): AdminVerificationAttempt[] {
  return [...adminVerificationAttempts];
}

async function recordFailure(userId: string, attemptedAt: number, context: AdminCorrectionPasswordContext): Promise<void> {
  await recordAttempt({
    userId,
    attemptedAt,
    outcome: AdminVerificationOutcome.FAILURE,
    action: context.action,
    ipAddress: context.ipAddress ?? null,
  });
}

async function recordAttempt(attempt: AdminVerificationAttempt): Promise<void> {
  adminVerificationAttempts.push(attempt);
  await prisma.adminVerificationLog.create({
    data: {
      userId: attempt.userId,
      attemptedAt: new Date(attempt.attemptedAt),
      outcome: attempt.outcome,
      action: attempt.action,
      ipAddress: attempt.ipAddress,
    },
  });
}

function isCorrectionLocked(userId: string, now: number): boolean {
  const recentFailures = adminVerificationAttempts.filter(
    (attempt) =>
      attempt.userId === userId &&
      attempt.outcome === AdminVerificationOutcome.FAILURE &&
      now - attempt.attemptedAt <= CORRECTION_WINDOW_MS
  );
  return recentFailures.length >= MAX_FAILED_CORRECTION_ATTEMPTS;
}

function pruneOldAttempts(now: number): void {
  const firstRecentIndex = adminVerificationAttempts.findIndex(
    (attempt) => now - attempt.attemptedAt <= CORRECTION_WINDOW_MS
  );

  if (firstRecentIndex === -1) {
    adminVerificationAttempts.length = 0;
    return;
  }

  if (firstRecentIndex > 0) {
    adminVerificationAttempts.splice(0, firstRecentIndex);
  }
}
