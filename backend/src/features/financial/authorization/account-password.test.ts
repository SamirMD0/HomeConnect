import bcrypt from 'bcrypt';
import { Role } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthenticationError, AuthorizationError } from '../../../lib/errors';
import { prisma } from '../../../lib/prisma';
import {
  getAdminCorrectionPasswordAttemptsForTests,
  resetAdminCorrectionPasswordAttemptsForTests,
  verifyAdminPasswordForCorrection,
} from './account-password';

vi.mock('bcrypt', () => ({
  default: {
    compare: vi.fn(),
  },
}));

vi.mock('../../../lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
    adminVerificationLog: {
      create: vi.fn(),
    },
  },
}));

const userId = '11111111-1111-4111-8111-111111111111';
const context = {
  action: 'CORRECT_DEBT',
  recordType: 'DEBT',
  recordId: '33333333-3333-4333-8333-333333333333',
  ipAddress: '127.0.0.1',
};

describe('verifyAdminPasswordForCorrection', () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    resetAdminCorrectionPasswordAttemptsForTests();
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      password: 'hashed-password',
      role: Role.ADMIN,
      deletedAt: null,
      isActive: true,
    } as any);
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
    vi.mocked(prisma.adminVerificationLog.create).mockResolvedValue({} as any);
  });

  it('accepts active admins with a valid account password', async () => {
    await expect(
      verifyAdminPasswordForCorrection(userId, 'admin-password', context)
    ).resolves.toBeUndefined();

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: userId },
      select: {
        password: true,
        role: true,
        deletedAt: true,
        isActive: true,
      },
    });
    expect(getAdminCorrectionPasswordAttemptsForTests()).toEqual([
      expect.objectContaining({
        userId,
        outcome: 'SUCCESS',
        action: 'CORRECT_DEBT',
        ipAddress: '127.0.0.1',
      }),
    ]);
    expect(prisma.adminVerificationLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId,
        outcome: 'SUCCESS',
        action: 'CORRECT_DEBT',
        ipAddress: '127.0.0.1',
      }),
    });
  });

  it('rejects non-admin users before accepting a correction', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      password: 'hashed-password',
      role: Role.EMPLOYEE,
      deletedAt: null,
      isActive: true,
    } as any);

    await expect(
      verifyAdminPasswordForCorrection(userId, 'admin-password', context)
    ).rejects.toThrow(AuthorizationError);

    expect(getAdminCorrectionPasswordAttemptsForTests()).toEqual([
      expect.objectContaining({ outcome: 'FAILURE', action: 'CORRECT_DEBT' }),
    ]);
  });

  it('locks correction password verification after five failed attempts in fifteen minutes', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-27T09:00:00.000Z'));
    vi.mocked(bcrypt.compare).mockResolvedValue(false as never);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(
        verifyAdminPasswordForCorrection(userId, 'wrong-password', context)
      ).rejects.toThrow(AuthenticationError);
    }

    await expect(
      verifyAdminPasswordForCorrection(userId, 'admin-password', context)
    ).rejects.toThrow('Too many failed correction password attempts');

    expect(prisma.user.findUnique).toHaveBeenCalledTimes(5);
    expect(getAdminCorrectionPasswordAttemptsForTests().map((attempt) => attempt.outcome)).toEqual([
      'FAILURE',
      'FAILURE',
      'FAILURE',
      'FAILURE',
      'FAILURE',
      'LOCKED',
    ]);
  });
});
