import bcrypt from 'bcrypt';
import { Role } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '../lib/prisma';
import { AuthService } from './auth.service';

vi.mock('bcrypt', () => ({
  default: {
    compare: vi.fn(),
    hash: vi.fn(),
  },
}));

vi.mock('../lib/prisma', () => ({
  prisma: {
    user: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

const activeAdmin = {
  id: 'admin-1',
  username: 'admin',
  password: 'hashed-admin-password',
  fullName: 'System Administrator',
  role: Role.ADMIN,
  isActive: true,
  deletedAt: null,
  lockedUntil: null,
  failedLoginAttempts: 0,
};

describe('AuthService setup account', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(bcrypt.hash).mockResolvedValue('hashed-new-password' as never);
  });

  it('creates the first administrator when no active admin exists', async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.user.create).mockResolvedValue({
      id: 'admin-1',
      username: 'admin',
      fullName: 'System Administrator',
      role: Role.ADMIN,
    } as never);

    const result = await AuthService.setupAccount({
      username: 'admin',
      passwordString: 'admin1234',
      fullName: 'System Administrator',
      role: Role.EMPLOYEE,
    });

    expect(prisma.user.create).toHaveBeenCalledWith({
      data: {
        username: 'admin',
        password: 'hashed-new-password',
        fullName: 'System Administrator',
        role: Role.ADMIN,
      },
    });
    expect(result.user.role).toBe(Role.ADMIN);
    expect(result).toHaveProperty('accessToken');
    expect(result).toHaveProperty('refreshToken');
  });

  it('requires admin credentials when an active admin already exists', async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue(activeAdmin as never);

    await expect(
      AuthService.setupAccount({
        username: 'employee',
        passwordString: 'employee1234',
        fullName: 'Employee User',
        role: Role.EMPLOYEE,
      })
    ).rejects.toThrow('Admin username and password are required to create an account');

    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('rejects invalid admin credentials', async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue(activeAdmin as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(activeAdmin as never);
    vi.mocked(bcrypt.compare).mockResolvedValue(false as never);

    await expect(
      AuthService.setupAccount({
        username: 'employee',
        passwordString: 'employee1234',
        fullName: 'Employee User',
        role: Role.EMPLOYEE,
        adminUsername: 'admin',
        adminPassword: 'wrong-password',
      })
    ).rejects.toThrow('Invalid admin credentials');

    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('creates a user after active admin password approval without auto-login tokens', async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue(activeAdmin as never);
    vi.mocked(prisma.user.findUnique)
      .mockResolvedValueOnce(activeAdmin as never)
      .mockResolvedValueOnce(null);
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
    vi.mocked(prisma.user.create).mockResolvedValue({
      id: 'employee-1',
      username: 'employee',
      fullName: 'Employee User',
      role: Role.EMPLOYEE,
      isActive: true,
    } as never);

    const result = await AuthService.setupAccount({
      username: 'employee',
      passwordString: 'employee1234',
      fullName: 'Employee User',
      role: Role.EMPLOYEE,
      adminUsername: 'admin',
      adminPassword: 'admin-password',
    });

    expect(prisma.user.create).toHaveBeenCalledWith({
      data: {
        username: 'employee',
        password: 'hashed-new-password',
        fullName: 'Employee User',
        role: Role.EMPLOYEE,
      },
    });
    expect(result).toEqual({
      user: {
        id: 'employee-1',
        username: 'employee',
        fullName: 'Employee User',
        role: Role.EMPLOYEE,
      },
    });
  });
});
