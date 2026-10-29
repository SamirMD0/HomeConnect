import { beforeEach, describe, expect, it, vi } from 'vitest';
const { repo, tx, transaction, invalidate } = vi.hoisted(() => ({
  transaction: vi.fn(),
  invalidate: vi.fn(),
  repo: { findByUsername: vi.fn(), create: vi.fn(), findById: vi.fn(), update: vi.fn() },
  tx: { branch: { findMany: vi.fn() }, userBranchAccess: { createMany: vi.fn() } },
}));
vi.mock('../repositories/users.repository', () => ({ UsersRepository: repo }));
vi.mock('bcrypt', () => ({ default: { hash: vi.fn().mockResolvedValue('hash') } }));
vi.mock('../features/financial/infrastructure/transaction', () => ({
  runFinancialTransaction: transaction,
}));
vi.mock('../lib/user-session-status', () => ({ invalidateUserSessionStatus: invalidate }));
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
    transaction.mockImplementation((operation: (client: unknown) => Promise<unknown>) =>
      operation(tx)
    );
    invalidate.mockReset();
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

interface StoredUser {
  id: string;
  username: string;
  fullName: string;
  role: 'ADMIN' | 'EMPLOYEE';
  isActive: boolean;
}
interface StoredGrant {
  userId: string;
  branchId: string;
  grantedById: string;
  grantedAt: string;
}

describe('employee access on role changes', () => {
  let persisted: StoredUser;
  let pending: StoredUser | null;
  let grants: StoredGrant[];
  let pendingGrants: StoredGrant[];
  let committed: boolean;
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('MULTI_BRANCH_SCOPING_ENABLED', 'false');
    persisted = { ...employee, role: 'ADMIN' };
    pending = null;
    grants = [];
    pendingGrants = [];
    committed = false;
    repo.findById.mockImplementation((_id: string, client?: unknown) =>
      Promise.resolve({ ...(client === tx ? pending! : persisted) })
    );
    repo.update.mockImplementation((_id: string, data: Partial<StoredUser>, client?: unknown) => {
      const updated = { ...(client === tx ? pending! : persisted), ...data };
      if (client === tx) pending = updated;
      else persisted = updated; // An accidental non-transactional update must fail the rollback test.
      return Promise.resolve(updated);
    });
    tx.branch.findMany.mockResolvedValue([{ id: 'main', createdById: 'owner' }]);
    tx.userBranchAccess.createMany.mockImplementation(
      async ({ data }: { data: Omit<StoredGrant, 'grantedAt'>[] }) => {
        for (const row of data) {
          if (
            !pendingGrants.some(
              (grant) => grant.userId === row.userId && grant.branchId === row.branchId
            )
          ) {
            pendingGrants.push({ ...row, grantedAt: 'new grant' });
          }
        }
      }
    );
    transaction.mockImplementation(async (operation: (client: unknown) => Promise<unknown>) => {
      pending = { ...persisted };
      pendingGrants = [...grants];
      try {
        const result = await operation(tx);
        persisted = { ...pending };
        grants = [...pendingGrants];
        committed = true;
        return result;
      } finally {
        pending = null;
      }
    });
    invalidate.mockImplementation(() => {
      expect(committed).toBe(true);
    });
  });
  it('ADMIN to EMPLOYEE grants the sole branch in the role-update transaction and invalidates only after commit', async () => {
    const user = await UsersService.updateUser(persisted.id, { role: 'EMPLOYEE' }, 'owner');
    expect(repo.findById).toHaveBeenCalledWith(user.id, tx);
    expect(repo.update).toHaveBeenCalledWith(user.id, { role: 'EMPLOYEE' }, tx);
    expect(tx.userBranchAccess.createMany).toHaveBeenCalledWith({
      data: [{ userId: user.id, branchId: 'main', grantedById: 'owner' }],
      skipDuplicates: true,
    });
    expect(persisted.role).toBe('EMPLOYEE');
    expect(grants).toEqual([
      { userId: user.id, branchId: 'main', grantedById: 'owner', grantedAt: 'new grant' },
    ]);
    expect(invalidate).toHaveBeenCalledExactlyOnceWith(user.id);
  });
  it('ADMIN to EMPLOYEE with scoping enabled changes the role without a grant', async () => {
    vi.stubEnv('MULTI_BRANCH_SCOPING_ENABLED', 'true');
    await UsersService.updateUser(persisted.id, { role: 'EMPLOYEE' }, 'owner');
    expect(persisted.role).toBe('EMPLOYEE');
    expect(tx.branch.findMany).not.toHaveBeenCalled();
    expect(tx.userBranchAccess.createMany).not.toHaveBeenCalled();
  });
  it('ADMIN to EMPLOYEE with no active branch commits the role without a grant or error', async () => {
    tx.branch.findMany.mockResolvedValue([]);
    await UsersService.updateUser(persisted.id, { role: 'EMPLOYEE' }, 'owner');
    expect(persisted.role).toBe('EMPLOYEE');
    expect(committed).toBe(true);
    expect(tx.userBranchAccess.createMany).not.toHaveBeenCalled();
  });
  it('EMPLOYEE to ADMIN preserves existing grants without grant calls', async () => {
    persisted.role = 'EMPLOYEE';
    const existing = {
      userId: persisted.id,
      branchId: 'old',
      grantedById: 'original',
      grantedAt: 'original time',
    };
    grants = [existing];
    await UsersService.updateUser(persisted.id, { role: 'ADMIN' }, 'owner');
    expect(persisted.role).toBe('ADMIN');
    expect(grants).toEqual([existing]);
    expect(tx.branch.findMany).not.toHaveBeenCalled();
    expect(tx.userBranchAccess.createMany).not.toHaveBeenCalled();
  });
  it('a fullName update without a role change makes no grant calls', async () => {
    persisted.role = 'EMPLOYEE';
    await UsersService.updateUser(persisted.id, { fullName: 'Renamed employee' }, 'owner');
    expect(persisted.fullName).toBe('Renamed employee');
    expect(persisted.role).toBe('EMPLOYEE');
    expect(tx.branch.findMany).not.toHaveBeenCalled();
    expect(tx.userBranchAccess.createMany).not.toHaveBeenCalled();
  });
  it('BRANCH_SELECTION_REQUIRED rolls back the role update and does not invalidate the session', async () => {
    tx.branch.findMany.mockResolvedValue([{ id: 'one' }, { id: 'two' }]);
    await expect(
      UsersService.updateUser(persisted.id, { role: 'EMPLOYEE' }, 'owner')
    ).rejects.toMatchObject({ statusCode: 409, code: 'BRANCH_SELECTION_REQUIRED' });
    expect(repo.update).toHaveBeenCalledWith(persisted.id, { role: 'EMPLOYEE' }, tx);
    expect(persisted.role).toBe('ADMIN');
    expect(committed).toBe(false);
    expect(grants).toEqual([]);
    expect(invalidate).not.toHaveBeenCalled();
  });
});
