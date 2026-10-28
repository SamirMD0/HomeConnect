import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BranchChip } from './BranchSelector';
import { BranchScopeContext, type BranchScopeContextValue } from './BranchScopeProvider';
import { BranchSelector } from './BranchSelector';
import type { Branch } from '../branches';

const main: Branch = { id: 'b1', code: 'MAIN', name: 'Main branch', address: null, phone: null, isActive: true };
const tyre: Branch = { id: 'b2', code: 'TYRE', name: 'فرع صور', address: null, phone: null, isActive: true };

const withScope = (value: Partial<BranchScopeContextValue>) =>
  renderToStaticMarkup(
    <BranchScopeContext.Provider
      value={{ ready: true, branches: [], selection: null, selectedBranch: null, select: () => undefined, ...value }}
    >
      <BranchSelector />
    </BranchScopeContext.Provider>
  );

describe('BranchChip', () => {
  it('shows a loading placeholder before the selection is known', () => {
    expect(renderToStaticMarkup(<BranchChip branches={[]} selection={null} />)).toContain('aria-label="Loading branches"');
  });

  it('shows a clear state when no branch is assigned', () => {
    expect(renderToStaticMarkup(<BranchChip branches={[]} selection={{ kind: 'none' }} />)).toContain('No branch assigned');
  });

  it('shows the selected branch code and name, or "All branches"', () => {
    const one = renderToStaticMarkup(<BranchChip branches={[main, tyre]} selection={{ kind: 'branch', branchId: 'b1' }} />);
    expect(one).toContain('MAIN');
    expect(one).toContain('Main branch');
    expect(renderToStaticMarkup(<BranchChip branches={[main, tyre]} selection={{ kind: 'all' }} />)).toContain('All branches');
  });

  it('renders Arabic branch names with dir="auto"', () => {
    const html = renderToStaticMarkup(<BranchChip branches={[main, tyre]} selection={{ kind: 'branch', branchId: 'b2' }} />);
    expect(html).toContain('dir="auto"');
    expect(html).toContain('فرع صور');
  });
});

describe('BranchSelector', () => {
  it('is a read-only chip, not a menu, for a single branch', () => {
    const html = withScope({ branches: [main], selection: { kind: 'branch', branchId: 'b1' } });
    expect(html).toContain('Branch: Main branch');
    expect(html).not.toContain('aria-label="Select branch"');
  });

  it('is a menu trigger when the user has several branches', () => {
    const html = withScope({ branches: [main, tyre], selection: { kind: 'all' } });
    expect(html).toContain('aria-label="Select branch"');
    expect(html).toContain('All branches');
  });

  it('shows the loading placeholder until the scope is ready', () => {
    expect(withScope({ ready: false, branches: [main], selection: null })).toContain('Loading branches');
  });
});
