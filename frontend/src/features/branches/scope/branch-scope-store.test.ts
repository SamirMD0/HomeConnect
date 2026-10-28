import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  BRANCH_SCOPE_HEADER,
  clearStoredSelection,
  headerForSelection,
  isBranchDependentQuery,
  readStoredSelection,
  resolveSelection,
  storageKey,
  withBranchScope,
  writeStoredSelection,
} from './branch-scope-store';

const A = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', code: 'MAIN', name: 'Main branch' };
const B = { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', code: 'TYR', name: 'Tyre' };

describe('resolveSelection', () => {
  it('has nothing to select without branches', () => {
    expect(resolveSelection([], 'all')).toEqual({ kind: 'none' });
  });

  it('always selects the only branch, ignoring any stored choice', () => {
    expect(resolveSelection([A], null)).toEqual({ kind: 'branch', branchId: A.id });
    expect(resolveSelection([A], 'all')).toEqual({ kind: 'branch', branchId: A.id });
    expect(resolveSelection([A], B.id)).toEqual({ kind: 'branch', branchId: A.id });
  });

  it('restores a stored branch the user can still access', () => {
    expect(resolveSelection([A, B], B.id)).toEqual({ kind: 'branch', branchId: B.id });
  });

  it('falls back to all branches for a stale, missing or "all" stored choice', () => {
    expect(resolveSelection([A, B], 'cccccccc-cccc-4ccc-8ccc-cccccccccccc')).toEqual({ kind: 'all' });
    expect(resolveSelection([A, B], null)).toEqual({ kind: 'all' });
    expect(resolveSelection([A, B], 'all')).toEqual({ kind: 'all' });
  });
});

describe('headerForSelection', () => {
  it('maps a branch to its id, all to "all", and none to no header', () => {
    expect(headerForSelection({ kind: 'branch', branchId: A.id })).toBe(A.id);
    expect(headerForSelection({ kind: 'all' })).toBe('all');
    expect(headerForSelection({ kind: 'none' })).toBeNull();
  });
});

describe('stored selection', () => {
  let store: Map<string, string>;
  beforeEach(() => {
    store = new Map();
    (globalThis as unknown as { window: unknown }).window = {
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => void store.set(key, value),
        removeItem: (key: string) => void store.delete(key),
      },
    };
  });
  afterEach(() => {
    delete (globalThis as unknown as { window?: unknown }).window;
  });

  it('is kept per user', () => {
    writeStoredSelection('user-1', { kind: 'branch', branchId: A.id });
    writeStoredSelection('user-2', { kind: 'all' });
    expect(readStoredSelection('user-1')).toBe(A.id);
    expect(readStoredSelection('user-2')).toBe('all');
    expect(store.has(storageKey('user-1'))).toBe(true);
  });

  it('removes the entry for "none" and on clear', () => {
    writeStoredSelection('user-1', { kind: 'all' });
    writeStoredSelection('user-1', { kind: 'none' });
    expect(readStoredSelection('user-1')).toBeNull();
    writeStoredSelection('user-1', { kind: 'all' });
    clearStoredSelection('user-1');
    expect(readStoredSelection('user-1')).toBeNull();
  });

  it('survives storage being unavailable', () => {
    delete (globalThis as unknown as { window?: unknown }).window;
    expect(readStoredSelection('user-1')).toBeNull();
    expect(() => writeStoredSelection('user-1', { kind: 'all' })).not.toThrow();
  });
});

describe('withBranchScope', () => {
  it('adds the header without dropping existing config', () => {
    expect(withBranchScope(A.id, { params: { page: 1 }, headers: { Accept: 'text/csv' } })).toEqual({
      params: { page: 1 },
      headers: { Accept: 'text/csv', [BRANCH_SCOPE_HEADER]: A.id },
    });
  });
});

describe('isBranchDependentQuery', () => {
  it('resets branch-owned data and keeps global data', () => {
    for (const key of [['customers'], ['dashboard', 'overview'], ['sales-orders', 'list'], ['inventory', 'receivings'], ['reports']]) {
      expect(isBranchDependentQuery(key)).toBe(true);
    }
    for (const key of [['products', 'list'], ['categories'], ['branches', 'accessible', 'u'], ['pricing-presets'], ['exchange-rates']]) {
      expect(isBranchDependentQuery(key)).toBe(false);
    }
  });

  it('still resets a product\'s service-job history', () => {
    expect(isBranchDependentQuery(['products', 'p1', 'service-jobs'])).toBe(true);
  });
});
