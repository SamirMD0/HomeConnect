import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BranchScopeContext, type BranchScopeContextValue } from './BranchScopeProvider';
import { BranchBadge, BranchRowLabel, branchIdOf, useCreateGuard, useShowBranchColumn } from './branch-ui';
import type { Branch } from '../branches';

const main: Branch = { id: 'b1', code: 'MAIN', name: 'Main branch', address: null, phone: null, isActive: true };
const tyre: Branch = { id: 'b2', code: 'TYRE', name: 'Tyre', address: null, phone: null, isActive: true };

function Probe() {
  const show = useShowBranchColumn();
  const guard = useCreateGuard();
  return <p data-show={String(show)} data-blocked={String(guard.blocked)} title={guard.reason} />;
}
const render = (node: React.ReactNode, value?: Partial<BranchScopeContextValue>) =>
  renderToStaticMarkup(
    value ? (
      <BranchScopeContext.Provider value={{ ready: true, branches: [], selection: null, selectedBranch: null, select: () => undefined, ...value }}>
        {node}
      </BranchScopeContext.Provider>
    ) : (
      node
    )
  );

describe('branch UI helpers', () => {
  it('behave as single-branch without a provider (existing tests and previews)', () => {
    expect(render(<Probe />)).toContain('data-show="false" data-blocked="false"');
    expect(render(<BranchRowLabel branchId="b1" />)).toBe('');
  });

  it('show the column and block creation only in "All branches" with two or more branches', () => {
    const all = render(<Probe />, { branches: [main, tyre], selection: { kind: 'all' } });
    expect(all).toContain('data-show="true" data-blocked="true"');
    expect(all).toContain('Select a branch in the header to create records.');
    expect(render(<Probe />, { branches: [main, tyre], selection: { kind: 'branch', branchId: 'b1' } })).toContain('data-show="false" data-blocked="false"');
    expect(render(<Probe />, { branches: [main], selection: { kind: 'branch', branchId: 'b1' } })).toContain('data-show="false" data-blocked="false"');
  });

  it('label rows with branch code and name, and stay honest for unknown branches', () => {
    const scope = { branches: [main, tyre], selection: { kind: 'all' as const } };
    expect(render(<BranchBadge branchId="b2" />, scope)).toContain('Tyre');
    expect(render(<BranchBadge branchId="gone" />, scope)).toContain('Other branch');
    expect(render(<BranchBadge branchId={null} />, scope)).toContain('—');
    expect(render(<BranchRowLabel branchId="b1" />, scope)).toContain('Main branch');
  });

  it('read branchId from loosely typed targets', () => {
    expect(branchIdOf({ branchId: 'b1', id: 'x' })).toBe('b1');
    expect(branchIdOf({ id: 'x' })).toBeUndefined();
    expect(branchIdOf(null)).toBeUndefined();
    expect(branchIdOf({ branchId: '' })).toBeUndefined();
  });
});
