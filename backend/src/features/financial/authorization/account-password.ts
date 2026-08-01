import bcrypt from 'bcrypt';
import { prisma } from '../../../lib/prisma';
import { AuthenticationError } from '../../../lib/errors';
import {
  AdminPasswordContext,
  getAdminPasswordAttemptsForTests,
  resetAdminPasswordAttemptsForTests,
  verifyAdminPassword,
} from '../../../lib/admin-verification';

export type AdminCorrectionPasswordContext = AdminPasswordContext;

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
  await verifyAdminPassword(userId, accountPassword, {
    ...context,
    domainLabel: 'financial corrections',
  });
}

export function resetAdminCorrectionPasswordAttemptsForTests(): void {
  resetAdminPasswordAttemptsForTests();
}

export function getAdminCorrectionPasswordAttemptsForTests() {
  return getAdminPasswordAttemptsForTests();
}
