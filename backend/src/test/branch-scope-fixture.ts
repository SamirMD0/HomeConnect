import { vi } from 'vitest';

export const routeBranchId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

/** Route contract fixtures put their actors and parents in one accessible branch.
 * Isolation tests exercise real grants and parents separately. */
export function singleBranchRouteModels() {
  return {
    branch: { findMany: vi.fn().mockResolvedValue([{ id: routeBranchId }]) },
    customer: { findUnique: vi.fn().mockResolvedValue({ branchId: routeBranchId }) },
    supplier: { findUnique: vi.fn().mockResolvedValue({ branchId: routeBranchId }) },
    debt: { findUnique: vi.fn().mockResolvedValue({ branchId: routeBranchId }) },
    installmentPlan: { findUnique: vi.fn().mockResolvedValue({ branchId: routeBranchId }) },
    payment: { findUnique: vi.fn().mockResolvedValue({ branchId: routeBranchId }) },
    salesOrder: { findUnique: vi.fn().mockResolvedValue({ branchId: routeBranchId }) },
    salesReturn: { findUnique: vi.fn().mockResolvedValue({ branchId: routeBranchId }) },
    customerCredit: { findUnique: vi.fn().mockResolvedValue({ branchId: routeBranchId }) },
    serviceJob: { findUnique: vi.fn().mockResolvedValue({ branchId: routeBranchId }) },
    supplierTransaction: { findUnique: vi.fn().mockResolvedValue({ branchId: routeBranchId }) },
    supplierReceiving: { findUnique: vi.fn().mockResolvedValue({ branchId: routeBranchId }) },
    prepaidPurchase: { findUnique: vi.fn().mockResolvedValue({ debt: { branchId: routeBranchId } }) },
  };
}
