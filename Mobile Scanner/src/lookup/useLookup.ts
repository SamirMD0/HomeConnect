import { useMemo } from 'react';
import { useInfiniteQuery, type QueryKey } from '@tanstack/react-query';
import type { ReadPage } from '@shared/lookup-contracts';
import { useSession } from '../session/SessionProvider';
import { backendBaseUrl } from '../api/hc-client';
import { queryKeys } from '../query/keys';
export function useLookup() {
  const session = useSession();
  const baseUrl = session.connection ? backendBaseUrl(session.connection) : '';
  const token = session.token ?? '';
  const client = useMemo(() => ({ baseUrl, token }), [baseUrl, token]);
  const scope = {
    server: baseUrl,
    userId: session.user?.id ?? '',
    branchId: session.branch.selected?.id ?? '',
  };
  return {
    session,
    client,
    scope,
    key: (resource: string, params: object = {}) => queryKeys.lookup(scope, resource, params),
  };
}
export function useLookupPages<T>(
  queryKey: QueryKey,
  load: (page: number) => Promise<ReadPage<T>>,
  enabled = true
) {
  return useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) => load(pageParam),
    initialPageParam: 1,
    getNextPageParam: (last) => last.nextPage,
    enabled,
  });
}
