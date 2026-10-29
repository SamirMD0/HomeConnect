import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BranchScopeContext, type BranchScopeContextValue } from '../../branches/scope/BranchScopeProvider';
import type { Branch } from '../../branches/branches';
import { CustomerBranchTransferDialog } from './CustomerBranchTransferDialog';

const branch = (id: string, code: string, name: string, isActive = true): Branch => ({ id, code, name, address: null, phone: null, isActive });
const scope: BranchScopeContextValue = {
  ready: true,
  branches: [branch('a', 'MAIN', 'Main branch'), branch('b', 'TYRE', 'فرع صور'), branch('c', 'OLD', 'Closed branch', false)],
  selection: { kind: 'all' },
  selectedBranch: null,
  select: () => undefined,
};

const render = (isOpen = true) =>
  renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <BranchScopeContext.Provider value={scope}>
        <CustomerBranchTransferDialog isOpen={isOpen} onClose={() => undefined} customer={{ id: 'x', name: 'علي حسن', branchId: 'a' }} />
      </BranchScopeContext.Provider>
    </QueryClientProvider>
  );

describe('CustomerBranchTransferDialog', () => {
  it('offers only other active branches as destinations', () => {
    const html = render();
    expect(html).toContain('<option value="b">TYRE · فرع صور</option>');
    expect(html).not.toContain('<option value="a">');
    expect(html).not.toContain('<option value="c">');
  });

  it('names the customer and their current branch, and says balances do not change', () => {
    const html = render();
    expect(html).toContain('علي حسن');
    expect(html).toContain('Main branch');
    expect(html).toContain('Balances do not change');
    expect(html).toContain('All records move together, or nothing moves.');
  });

  it('asks for the account password and keeps the move button inactive until a branch is checked', () => {
    const html = render();
    expect(html).toContain('type="password"');
    expect(html).toMatch(/autoComplete="current-password"|autocomplete="current-password"/);
    expect(html).toMatch(/pointer-events-none opacity-50"><button type="submit"/);
  });

  it('renders nothing when closed', () => {
    expect(render(false)).not.toContain('Change branch');
  });
});
