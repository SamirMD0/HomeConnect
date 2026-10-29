import type { Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { accessible } = vi.hoisted(() => ({ accessible: vi.fn() }));
vi.mock('../features/branches/branches.service', () => ({
  BranchesService: { accessibleBranches: accessible },
}));
import { branchScopeMiddleware } from './branch-scope.middleware';

const a = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const b = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const user = { userId: 'employee', role: 'EMPLOYEE' };
async function resolve(header?: string | string[]) {
  const req = {
    user,
    headers: header === undefined ? {} : { 'x-branch-scope': header },
  } as Request;
  const next = vi.fn();
  await branchScopeMiddleware(req, {} as Response, next);
  return { scope: req.branchScope, error: next.mock.calls[0]?.[0] };
}

describe('request branch scope', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    accessible.mockResolvedValue([{ id: a }]);
  });
  it('resolves an accessible UUID to single scope, normalizing UUID case', async () => {
    expect(await resolve(a.toUpperCase())).toEqual({
      scope: { mode: 'single', branchIds: [a] },
      error: undefined,
    });
    expect(accessible).toHaveBeenCalledExactlyOnceWith(user);
  });
  it('rejects an inaccessible UUID header with 403 BRANCH_ACCESS_DENIED', async () => {
    expect((await resolve(b)).error).toMatchObject({
      statusCode: 403,
      code: 'BRANCH_ACCESS_DENIED',
    });
  });
  it.each(['', 'ALL', 'garbage', a + ',' + b, [a, b]])(
    'rejects invalid header %j with 400',
    async (header) => {
      expect((await resolve(header)).error).toMatchObject({ statusCode: 400 });
      expect(accessible).not.toHaveBeenCalled();
    }
  );
  it.each([undefined, 'all'])(
    'resolves missing/all header %j to the accessible set',
    async (header) => {
      expect((await resolve(header)).scope).toEqual({ mode: 'all', branchIds: [a] });
    }
  );
  it('leaves an employee without grants with an empty all scope', async () => {
    accessible.mockResolvedValue([]);
    expect((await resolve()).scope).toEqual({ mode: 'all', branchIds: [] });
  });
  it('reloads access on each request so revocation is immediate', async () => {
    await resolve();
    accessible.mockResolvedValue([]);
    expect((await resolve()).scope?.branchIds).toEqual([]);
    expect(accessible).toHaveBeenCalledTimes(2);
  });
  it('requires authentication before resolving branches', async () => {
    const next = vi.fn();
    await branchScopeMiddleware({ headers: {} } as Request, {} as Response, next);
    expect(next.mock.calls[0][0]).toMatchObject({ statusCode: 401 });
    expect(accessible).not.toHaveBeenCalled();
  });
});
