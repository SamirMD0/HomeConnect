import type { AxiosRequestConfig } from 'axios';
import type { QueryKey } from '@tanstack/react-query';

/**
 * Branch scope outside React.
 *
 * The axios instance is module-level, so the current scope lives here and the
 * React provider keeps it in sync. The backend reads `X-Branch-Scope` (a branch
 * id or "all") on every branch-owned route; a request with no header is treated
 * as "all accessible branches", which is also today's single-branch behaviour.
 */
export const BRANCH_SCOPE_HEADER = 'X-Branch-Scope';
export const BRANCH_ACCESS_DENIED_EVENT = 'branch_access_denied';

export interface ScopeBranch {
  id: string;
  code: string;
  name: string;
}

export type BranchSelection =
  | { kind: 'none' }
  | { kind: 'all' }
  | { kind: 'branch'; branchId: string };

let currentHeader: string | null = null;

export function getBranchScopeHeader(): string | null {
  return currentHeader;
}

export function setBranchScopeHeader(value: string | null): void {
  currentHeader = value;
}

/**
 * Record branch for writes. While a page or dialog for one record is open
 * (a customer profile, an edit dialog), its writes must name that record's
 * branch even when the header selector shows "All branches": the server
 * rejects writes in multi-branch "all" scope. Entries stack, so a dialog
 * opened on a profile page wins until it closes. Reads are never affected.
 */
const recordBranchStack: Array<{ token: symbol; branchId: string }> = [];

export function pushRecordBranch(branchId: string): () => void {
  const token = Symbol('record-branch');
  recordBranchStack.push({ token, branchId });
  return () => {
    const index = recordBranchStack.findIndex((entry) => entry.token === token);
    if (index >= 0) recordBranchStack.splice(index, 1);
  };
}

export function getRecordBranch(): string | null {
  return recordBranchStack[recordBranchStack.length - 1]?.branchId ?? null;
}

const READ_METHODS = new Set(['get', 'head', 'options']);

/**
 * The X-Branch-Scope a request should carry, in priority order: an explicit
 * per-request header, then (for writes only) the open record's branch, then
 * the selected scope.
 */
export function scopeHeaderForRequest(method: string | undefined, explicit: unknown): string | null {
  if (typeof explicit === 'string' && explicit) return explicit;
  const isWrite = !READ_METHODS.has((method ?? 'get').toLowerCase());
  if (isWrite) {
    const record = getRecordBranch();
    if (record) return record;
  }
  return currentHeader;
}

/** The header value a selection sends. `none` sends nothing: the server answers with an empty set. */
export function headerForSelection(selection: BranchSelection): string | null {
  if (selection.kind === 'branch') return selection.branchId;
  if (selection.kind === 'all') return 'all';
  return null;
}

/**
 * Picks the selection for a user from their accessible branches and the choice
 * they stored last time. One branch is always selected outright; "All branches"
 * exists only for two or more; a stored branch the user lost access to falls
 * back to "all".
 */
export function resolveSelection(branches: ScopeBranch[], stored: string | null): BranchSelection {
  if (branches.length === 0) return { kind: 'none' };
  if (branches.length === 1) return { kind: 'branch', branchId: branches[0].id };
  if (stored && branches.some((branch) => branch.id === stored)) return { kind: 'branch', branchId: stored };
  return { kind: 'all' };
}

export function storageKey(userId: string): string {
  return `homeconnect.branchScope.${userId}`;
}

export function readStoredSelection(userId: string): string | null {
  try {
    return window.localStorage.getItem(storageKey(userId));
  } catch {
    return null;
  }
}

export function writeStoredSelection(userId: string, selection: BranchSelection): void {
  try {
    const value = headerForSelection(selection);
    if (value) window.localStorage.setItem(storageKey(userId), value);
    else window.localStorage.removeItem(storageKey(userId));
  } catch {
    /* storage unavailable — keep the selection in memory only */
  }
}

export function clearStoredSelection(userId: string): void {
  try {
    window.localStorage.removeItem(storageKey(userId));
  } catch {
    /* ignore */
  }
}

/**
 * Per-request override, for a mutation started from "All branches" on a record
 * that belongs to one branch. The server rejects writes in multi-branch "all"
 * scope, so such a request must name the record's own branch:
 *
 *   api.patch(`/customers/${id}`, body, withBranchScope(customer.branchId))
 */
export function withBranchScope(branchId: string, config: AxiosRequestConfig = {}): AxiosRequestConfig {
  return { ...config, headers: { ...(config.headers ?? {}), [BRANCH_SCOPE_HEADER]: branchId } };
}

/**
 * Query roots whose data does not depend on the branch: the product catalogue,
 * stock-independent settings, pricing, backups and system state. Everything
 * else is reset when the scope changes. A key under a global root that names
 * branch-owned data (a product's service-job history) is still reset.
 */
const GLOBAL_QUERY_ROOTS = new Set([
  'auth',
  'branches',
  'products',
  'product',
  'categories',
  'pricing',
  'pricing-presets',
  'pricing-cards',
  'pricing-card-index',
  'pricing-card-templates',
  'pricing-card-feature-icons',
  'brand-logos',
  'shop-profile',
  'business-settings',
  'exchange-rates',
  'backup',
  'maintenance',
  'diagnostics-errors',
  'diagnostics-health',
  'scanner',
  'system',
]);

export function isBranchDependentQuery(queryKey: QueryKey): boolean {
  const root = typeof queryKey[0] === 'string' ? queryKey[0] : '';
  if (!GLOBAL_QUERY_ROOTS.has(root)) return true;
  return queryKey.some((part) => part === 'service-jobs');
}
