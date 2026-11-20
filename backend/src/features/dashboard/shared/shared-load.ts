import type { BranchScope } from '../../branches/branch-scope';

/**
 * The dashboard asks for the same records from several cards at once: overview, customer
 * figures and alerts all read customer balances, and every branch breakdown reads them
 * again. A load already running for the same arguments is shared instead of repeated.
 * Nothing is kept once it finishes, so a later request always reads fresh records.
 * Callers must treat the shared records as read-only.
 */
const running = new Map<string, Promise<unknown>>();

export function sharedLoad<T>(name: string, parts: unknown[], load: () => Promise<T>): Promise<T> {
  const key = name + ':' + JSON.stringify(parts);
  const existing = running.get(key) as Promise<T> | undefined;
  if (existing) return existing;
  const started = load().finally(() => {
    if (running.get(key) === started) running.delete(key);
  });
  running.set(key, started);
  return started;
}

/** The same branches in any order are the same scope. */
export function scopeKey(scope: BranchScope): string {
  return scope.mode + ':' + [...scope.branchIds].sort().join(',');
}
