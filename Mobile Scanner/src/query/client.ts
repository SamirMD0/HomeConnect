import { QueryClient } from '@tanstack/react-query';
import { HcApiError } from '../api/hc-client';
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (attempt, error) =>
        attempt < 2 &&
        error instanceof HcApiError &&
        (error.kind === 'NETWORK' || (error.status ?? 0) >= 500),
    },
    mutations: { retry: false },
  },
});
export async function clearQueryCache() {
  await queryClient.cancelQueries();
  queryClient.clear();
}
