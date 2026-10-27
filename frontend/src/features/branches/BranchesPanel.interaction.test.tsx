// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
const { mutate } = vi.hoisted(() => ({ mutate: vi.fn() }));
vi.mock('./branches', async (importOriginal) => {
  const real = await importOriginal<typeof import('./branches')>();
  return {
    ...real,
    useBranches: () => ({
      data: [
        { id: 'main', code: 'MAIN', name: 'Main', address: null, phone: null, isActive: true },
      ],
      isLoading: false,
      isError: false,
    }),
    useBranchMutation: () => ({ mutateAsync: mutate, isPending: false }),
    useStaffBranchAccess: () => ({ data: [], isLoading: false, isError: false }),
    useSetUserBranchAccess: () => ({ mutateAsync: vi.fn(), isPending: false }),
  };
});
import { BranchesPanel } from './BranchesPanel';
describe('BranchesPanel server conflicts', () => {
  it('shows the server LAST_ACTIVE_BRANCH message after deactivation is rejected', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    mutate.mockRejectedValueOnce({
      response: {
        data: {
          error: { code: 'LAST_ACTIVE_BRANCH', message: 'At least one branch must stay active' },
        },
      },
    });
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    try {
      await act(async () => {
        root.render(<BranchesPanel />);
      });
      const deactivate = Array.from(host.querySelectorAll('button')).find(
        (b) => b.textContent === 'Deactivate'
      );
      expect(deactivate).toBeTruthy();
      await act(async () => {
        deactivate!.click();
      });
      expect(mutate).toHaveBeenCalledWith({ id: 'main', input: { isActive: false } });
      expect(host.querySelector('[role="alert"]')?.textContent).toBe(
        'At least one branch must stay active'
      );
    } finally {
      await act(async () => root.unmount());
      host.remove();
    }
  });
});
