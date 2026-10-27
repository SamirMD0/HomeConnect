import { beforeEach, describe, expect, it, vi } from 'vitest';
const { repo, tx } = vi.hoisted(() => ({
  repo: { findByUsername: vi.fn(), create: vi.fn(), findById: vi.fn(), update: vi.fn() },
  tx: { branch: { findMany: vi.fn() }, userBranchAccess: { createMany: vi.fn() } },
}));
vi.mock('../repositories/users.repository', () => ({ UsersRepository: repo }));
vi.mock('bcrypt', () => ({ default: { hash: vi.fn().mockResolvedValue('hash') } }));
vi.mock('../features/financial/infrastructure/transaction', () => ({
  runFinancialTransaction: (operation: (client: unknown) => Promise<unknown>) => operation(tx),
}));
vi.mock('../lib/user-session-status', () => ({ invalidateUserSessionStatus: vi.fn() }));
import { UsersService } from './users.service';
const employee = {
  id: 'new-employee',
  role: 'EMPLOYEE',
  username: 'new',
  fullName: 'New employee',
  isActive: true,
};
const input = { username: 'new', passwordString: 'password', fullName: 'New employee' };
describe('new employee default branch access', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('MULTI_BRANCH_SCOPING_ENABLED', 'false');
    repo.findByUsername.mockResolvedValue(null);
    repo.create.mockResolvedValue(employee);
    tx.branch.findMany.mockResolvedValue([{ id: 'main', createdById: 'owner' }]);
  });
  it('createUser grants the single active branch to a fresh employee in the creation transaction when scoping is off', async () => {
    await UsersService.createUser(input);
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ role: 'EMPLOYEE' }), tx);
    expect(tx.userBranchAccess.createMany).toHaveBeenCalledWith({
      data: [{ userId: employee.id, branchId: 'main', grantedById: 'owner' }],
      skipDuplicates: true,
    });
  });
  it('createUser grants nothing when branch scoping is enabled', async () => {
    vi.stubEnv('MULTI_BRANCH_SCOPING_ENABLED', 'true');
    await UsersService.createUser(input);
    expect(tx.branch.findMany).not.toHaveBeenCalled();
    expect(tx.userBranchAccess.createMany).not.toHaveBeenCalled();
  });
  it('createUser does not grant administrators', async () => {
    repo.create.mockResolvedValue({ ...employee, role: 'ADMIN' });
    await UsersService.createUser({ ...input, role: 'ADMIN' });
    expect(tx.userBranchAccess.createMany).not.toHaveBeenCalled();
    expect(tx.branch.findMany).not.toHaveBeenCalled();
  });
  it('createUser is a no-op for grants when no active branch exists', async () => {
    tx.branch.findMany.mockResolvedValue([]);
    await UsersService.createUser(input);
    expect(tx.userBranchAccess.createMany).not.toHaveBeenCalled();
  });
  it('reactivating a soft-deleted employee leaves existing grants untouched', async () => {
    repo.findById.mockResolvedValue({ ...employee, deletedAt: new Date(), isActive: false });
    repo.update.mockResolvedValue(employee);
    await UsersService.updateUser(employee.id, { isActive: true }, 'owner');
    expect(tx.branch.findMany).not.toHaveBeenCalled();
    expect(tx.userBranchAccess.createMany).not.toHaveBeenCalled();
  });
});
