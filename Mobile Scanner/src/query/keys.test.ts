import { describe, expect, it } from 'vitest';
import { queryKeys } from './keys';
import { clearQueryCache, queryClient } from './client';
const scope = { server: 'http://pc:3011', userId: 'u', branchId: 'a' };
describe('branch and account query isolation', () => {
  it('uses stable keys with a server, user, and branch boundary', () => {
    expect(queryKeys.customers(scope, 'Anna')).toEqual(queryKeys.customers({ ...scope }, 'Anna'));
    for (const changed of [
      { ...scope, branchId: 'b' },
      { ...scope, userId: 'other' },
      { ...scope, server: 'http://other:3011' },
    ]) {
      expect(queryKeys.suppliers(changed)).not.toEqual(queryKeys.suppliers(scope));
    }
    expect(queryKeys.customers(scope, 'Anna')).not.toEqual(queryKeys.customers(scope, 'Ben'));
  });
  it('clears cached branch data on the shared sign-out/switch boundary', async () => {
    queryClient.setQueryData(queryKeys.suppliers(scope), ['private']);
    queryClient.setQueryData(queryKeys.pendingBills(scope), ['bill']);
    await clearQueryCache();
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
    expect(queryClient.getDefaultOptions().queries?.staleTime).toBe(30_000);
  });
  it('cancels in-flight queries so a late response cannot restore a cleared cache', async () => {
    let finish!: (value: string) => void;
    const request = queryClient
      .fetchQuery({
        queryKey: queryKeys.suppliers(scope),
        queryFn: () =>
          new Promise<string>((resolve) => {
            finish = resolve;
          }),
      })
      .catch(() => undefined);
    await clearQueryCache();
    finish('old branch');
    await request;
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
  });
});
