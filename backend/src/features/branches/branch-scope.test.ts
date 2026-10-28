import { describe, expect, it } from 'vitest';
import { assertInScope, scopeWhere, writeBranch } from './branch-scope';

const a = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const b = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

describe('branch scope helpers', () => {
  it('scopeWhere restricts reads to the accessible set, including an empty set', () => {
    expect(scopeWhere({ mode: 'all', branchIds: [a, b] })).toEqual({ branchId: { in: [a, b] } });
    expect(scopeWhere({ mode: 'all', branchIds: [] })).toEqual({ branchId: { in: [] } });
  });
  it.each(['single', 'all'] as const)(
    'writeBranch permits exactly one branch in %s scope',
    (mode) => {
      expect(writeBranch({ mode, branchIds: [a] })).toBe(a);
    }
  );
  it('writeBranch rejects an empty accessible set with NO_BRANCH_AVAILABLE', () => {
    expect(() => writeBranch({ mode: 'all', branchIds: [] })).toThrowError(
      expect.objectContaining({ statusCode: 409, code: 'NO_BRANCH_AVAILABLE' })
    );
  });
  it('writeBranch rejects a multi-branch all scope with BRANCH_SELECTION_REQUIRED', () => {
    expect(() => writeBranch({ mode: 'all', branchIds: [a, b] })).toThrowError(
      expect.objectContaining({ statusCode: 409, code: 'BRANCH_SELECTION_REQUIRED' })
    );
  });
  it('assertInScope accepts an accessible record and hides other records with the caller’s 404', () => {
    const scope = { mode: 'all' as const, branchIds: [a] };
    expect(() => assertInScope(a, scope, 'Customer not found')).not.toThrow();
    expect(() => assertInScope(b, scope, 'Customer not found')).toThrowError(
      expect.objectContaining({ statusCode: 404, code: 'NOT_FOUND', message: 'Customer not found' })
    );
    expect(() => assertInScope(a, { mode: 'all', branchIds: [] }, 'Supplier not found')).toThrow(
      'Supplier not found'
    );
  });
});
