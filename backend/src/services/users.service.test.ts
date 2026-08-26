import { Role } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { invalidateUserSessionStatus } from '../lib/user-session-status';
import { UsersRepository } from '../repositories/users.repository';
import { UsersService } from './users.service';

vi.mock('../repositories/users.repository', () => ({
  UsersRepository: {
    findById: vi.fn(),
    findAll: vi.fn(),
    update: vi.fn(),
    softDelete: vi.fn(),
  },
}));

vi.mock('../lib/user-session-status', () => ({
  invalidateUserSessionStatus: vi.fn(),
}));

const admin = {
  id: 'admin-1',
  username: 'admin',
  fullName: 'Administrator',
  role: Role.ADMIN,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
  branchId: null,
};

describe('UsersService session invalidation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('invalidates the session cache after updating a user', async () => {
    vi.mocked(UsersRepository.findById).mockResolvedValue(admin);
    vi.mocked(UsersRepository.update).mockResolvedValue({
      id: admin.id,
      username: admin.username,
      fullName: admin.fullName,
      role: admin.role,
      isActive: false,
    });

    await UsersService.updateUser(admin.id, { isActive: false }, 'admin-2');

    expect(invalidateUserSessionStatus).toHaveBeenCalledWith(admin.id);
  });

  it('invalidates the session cache after soft-deleting a user', async () => {
    const employee = { ...admin, id: 'employee-1', role: Role.EMPLOYEE };
    vi.mocked(UsersRepository.findById).mockResolvedValue(employee);
    vi.mocked(UsersRepository.softDelete).mockResolvedValue({
      ...employee,
      isActive: false,
      deletedAt: new Date(),
      password: 'not-selected-by-the-service',
      failedLoginAttempts: 0,
      lockedUntil: null,
    });

    await UsersService.deactivateUser(employee.id, admin.id);

    expect(invalidateUserSessionStatus).toHaveBeenCalledWith(employee.id);
  });
});

describe('UsersService self-deactivation protection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(UsersRepository.findById).mockResolvedValue(admin);
  });

  it('rejects deactivating your own account through update', async () => {
    await expect(
      UsersService.updateUser(admin.id, { isActive: false }, admin.id),
    ).rejects.toThrow('You cannot deactivate your own account');

    expect(UsersRepository.update).not.toHaveBeenCalled();
  });

  it('rejects deleting your own account', async () => {
    await expect(
      UsersService.deactivateUser(admin.id, admin.id),
    ).rejects.toThrow('You cannot deactivate your own account');

    expect(UsersRepository.softDelete).not.toHaveBeenCalled();
  });
});
