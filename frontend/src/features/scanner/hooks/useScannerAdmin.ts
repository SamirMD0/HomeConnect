import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { scannerApi } from '../api/scanner.api';

export const scannerKeys = {
  all: ['scanner'] as const,
  lanStatus: () => [...scannerKeys.all, 'lan-status'] as const,
  sessions: () => [...scannerKeys.all, 'sessions'] as const,
};

/**
 * Status and sessions are polled while the Hub is open.
 *
 * A phone can pair or drop out without the PC doing anything, so the panel has
 * to discover that on its own rather than only after a button is pressed. Five
 * seconds is unnoticeable against a local backend and keeps the session list
 * honest.
 */
const HUB_POLL_MS = 5_000;

export function useLanStatus(enabled = true) {
  return useQuery({
    queryKey: scannerKeys.lanStatus(),
    queryFn: () => scannerApi.lanStatus(),
    refetchInterval: enabled ? HUB_POLL_MS : false,
    enabled,
    retry: false,
  });
}

export function useScannerSessions(enabled = true) {
  return useQuery({
    queryKey: scannerKeys.sessions(),
    queryFn: () => scannerApi.sessions(),
    refetchInterval: enabled ? HUB_POLL_MS : false,
    enabled,
    retry: false,
  });
}

/** Both LAN mutations change the session list too, so both refresh everything. */
const invalidateScanner = (queryClient: ReturnType<typeof useQueryClient>) =>
  queryClient.invalidateQueries({ queryKey: scannerKeys.all });

export function useEnableLan() {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: () => scannerApi.enableLan(), onSuccess: () => invalidateScanner(queryClient) });
}

export function useDisableLan() {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: () => scannerApi.disableLan(), onSuccess: () => invalidateScanner(queryClient) });
}

/**
 * Not invalidated on success: the minted code is returned once and held in the
 * component. Refetching would not bring it back.
 */
export function useCreatePairingCode() {
  return useMutation({ mutationFn: () => scannerApi.createPairingCode() });
}

export function useRevokeSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => scannerApi.revokeSession(id),
    onSuccess: () => invalidateScanner(queryClient),
  });
}
