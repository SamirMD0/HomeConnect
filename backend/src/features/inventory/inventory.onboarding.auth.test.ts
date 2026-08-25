import bcrypt from 'bcrypt';
import { Role } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { repository, userFindUnique, verificationLogCreate } = vi.hoisted(() => ({
  repository: {
    findProductsForOnboarding: vi.fn(),
    findOpeningBalances: vi.fn(),
  },
  userFindUnique: vi.fn(),
  verificationLogCreate: vi.fn(),
}));

vi.mock('bcrypt', () => ({ default: { compare: vi.fn() } }));
vi.mock('../../lib/prisma', () => ({
  prisma: {
    user: { findUnique: userFindUnique },
    adminVerificationLog: { create: verificationLogCreate },
  },
}));
vi.mock('./inventory.repository', () => ({ InventoryRepository: repository }));
// Execute the write callback and retain the verification-related Prisma shape so
// the test catches any accidental return of password verification to this path.
vi.mock('../financial/infrastructure/transaction', () => ({
  runFinancialTransaction: vi.fn((operation: (tx: unknown) => unknown) => operation({
    user: { findUnique: userFindUnique },
    adminVerificationLog: { create: verificationLogCreate },
  })),
}));

import { InventoryService } from './inventory.service';

const userId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const productId = '11111111-1111-4111-8111-111111111111';
const input = {
  dryRun: false,
  items: [{ productId, openingCount: 0 }],
};

describe('batch onboarding authorization without password verification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    userFindUnique.mockResolvedValue({ password: 'hash', role: Role.ADMIN, deletedAt: null, isActive: true });
    verificationLogCreate.mockResolvedValue({});
    repository.findProductsForOnboarding.mockResolvedValue([]);
    repository.findOpeningBalances.mockResolvedValue([]);
  });

  it('writes without checking bcrypt or creating a verification log', async () => {
    await expect(InventoryService.batchVerifyOpeningCount(input, { userId, role: Role.ADMIN }))
      .resolves.toMatchObject({ dryRun: false });

    expect(repository.findProductsForOnboarding).toHaveBeenCalledTimes(1);
    expect(userFindUnique).not.toHaveBeenCalled();
    expect(bcrypt.compare).not.toHaveBeenCalled();
    expect(verificationLogCreate).not.toHaveBeenCalled();
  });

  it('classifies a dry run without a password and without touching the lockout', async () => {
    await InventoryService.batchVerifyOpeningCount(
      { dryRun: true, items: [{ productId, openingCount: 0 }] },
      { userId, role: Role.ADMIN }
    );

    // The classification ran…
    expect(repository.findProductsForOnboarding).toHaveBeenCalledTimes(1);
    // …and no password was ever verified, so nothing was spent against the lockout.
    expect(bcrypt.compare).not.toHaveBeenCalled();
    expect(verificationLogCreate).not.toHaveBeenCalled();
  });

  it('still refuses a dry run from a non-admin', async () => {
    await expect(InventoryService.batchVerifyOpeningCount(
      { dryRun: true, items: [{ productId, openingCount: 0 }] },
      { userId, role: Role.EMPLOYEE }
    )).rejects.toThrow('Only administrators can verify opening counts in batch');
  });
});
