import type { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
vi.mock('./branches.service', () => ({ BranchesService: { accessibleBranches: vi.fn() } }));
import { BranchesService } from './branches.service';
import { resolveCreationBranch } from './creation-branch';
describe('resolveCreationBranch', () => {
  const user = { userId: 'u', role: 'EMPLOYEE' },
    tx = {} as Prisma.TransactionClient;
  it('returns 409 with instructions when no active accessible branch exists', async () => {
    vi.mocked(BranchesService.accessibleBranches).mockResolvedValue([]);
    await expect(resolveCreationBranch(user, tx)).rejects.toMatchObject({
      statusCode: 409,
      code: 'NO_BRANCH_AVAILABLE',
      message: expect.stringContaining('Settings → Branches'),
    });
  });
  it('uses the single accessible active branch in the caller transaction', async () => {
    vi.mocked(BranchesService.accessibleBranches).mockResolvedValue([{ id: 'main' }] as never);
    expect(await resolveCreationBranch(user, tx)).toBe('main');
    expect(BranchesService.accessibleBranches).toHaveBeenCalledWith(user, tx);
  });
  it('requires selection for multiple branches', async () => {
    vi.mocked(BranchesService.accessibleBranches).mockResolvedValue([
      { id: 'a' },
      { id: 'b' },
    ] as never);
    await expect(resolveCreationBranch(user, tx)).rejects.toMatchObject({
      statusCode: 409,
      code: 'BRANCH_SELECTION_REQUIRED',
    });
  });
});
