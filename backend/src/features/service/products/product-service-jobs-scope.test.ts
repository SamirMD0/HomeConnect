import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProductsRepository } from './products.repository';
import { ProductsService } from './products.service';
import { prisma } from '../../../lib/prisma';
vi.mock('../../../lib/prisma', () => ({ prisma: { serviceJob: { findMany: vi.fn(), count: vi.fn() } } }));
const scope = { mode: 'single' as const, branchIds: ['a'] };
beforeEach(() => { vi.clearAllMocks(); vi.mocked(prisma.serviceJob.findMany).mockResolvedValue([]); vi.mocked(prisma.serviceJob.count).mockResolvedValue(0); });
describe('product service jobs remain branch-owned', () => {
  it('filters both rows and count by accessible branch IDs', async () => {
    await ProductsRepository.serviceJobs('product', 0, 10, scope);
    expect(prisma.serviceJob.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { productId: 'product', branchId: { in: ['a'] } } }));
    expect(prisma.serviceJob.count).toHaveBeenCalledWith({ where: { productId: 'product', branchId: { in: ['a'] } } });
  });
  it('passes the resolved scope through the product facade', async () => {
    const product = vi.spyOn(ProductsService, 'get').mockResolvedValue({ id: 'product' } as never);
    const repository = vi.spyOn(ProductsRepository, 'serviceJobs').mockResolvedValue({ items: [], total: 0 });
    await ProductsService.serviceJobs('product', { page: 1, pageSize: 10 }, scope);
    expect(repository).toHaveBeenCalledWith('product', 0, 10, scope);
    product.mockRestore(); repository.mockRestore();
  });
});
