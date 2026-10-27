import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BranchesPanel } from './BranchesPanel';
import type { Branch, StaffBranchAccess } from './branches';

const render = (branches: Branch[], staff: StaffBranchAccess[] = []) => {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
  client.setQueryData(['branches'], branches);
  client.setQueryData(['branches', 'staff-access'], staff);
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <BranchesPanel />
    </QueryClientProvider>
  );
};

const main: Branch = { id: 'b1', code: 'MAIN', name: 'Main shop', address: 'Beirut', phone: null, isActive: true, assignedUserCount: 1 };
const old: Branch = { id: 'b2', code: 'OLD', name: 'Old shop', address: null, phone: null, isActive: false, assignedUserCount: 0 };

describe('BranchesPanel', () => {
  it('states plainly that records are not yet separated by branch', () => {
    const html = render([]);
    expect(html).toContain('not separated by branch yet');
    expect(html).toContain('No branches have been set up.');
    expect(html).not.toContain('Staff branch access');
  });

  it('lists branches with status and offers staff access only for active branches', () => {
    const html = render([main, old], [
      { id: 'u1', username: 'admin', fullName: 'Admin', role: 'ADMIN', isActive: true, allBranches: true, branchIds: [] },
      { id: 'u2', username: 'sara', fullName: 'Sara', role: 'EMPLOYEE', isActive: true, allBranches: false, branchIds: ['b1'] },
    ]);
    expect(html).toContain('MAIN');
    expect(html).toContain('Inactive');
    expect(html).toContain('Staff branch access');
    expect(html).toContain('All branches (administrator)');
    expect(html).toContain('aria-label="Sara works in Main shop"');
    expect(html).not.toContain('Sara works in Old shop');
    expect(html).toMatch(/aria-label="Sara works in Main shop"[^>]*checked/);
  });
});
