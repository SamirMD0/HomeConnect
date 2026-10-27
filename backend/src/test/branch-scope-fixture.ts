import { vi } from 'vitest';

export const routeBranchId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

/** Route contract fixtures put their actors and parents in one accessible branch.
 * Isolation tests exercise real grants and parents separately. */
export function singleBranchRouteModels() {
  return {
    branch: { findMany: vi.fn().mockResolvedValue([{ id: routeBranchId }]) },
    customer: { findUnique: vi.fn().mockResolvedValue({ branchId: routeBranchId }) },
    supplier: { findUnique: vi.fn().mockResolvedValue({ branchId: routeBranchId }) },
  };
}
