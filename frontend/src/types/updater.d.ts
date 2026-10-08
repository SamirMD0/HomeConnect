export type UpdaterState = 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'preparing' | 'error';

export interface UpdaterStatus {
  state: UpdaterState;
  version?: string;
  progressPct?: number;
  error?: string;
  lastCheckedAt?: string;
}
