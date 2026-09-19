import { Role } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { repository, verify, writeAudit, tx } = vi.hoisted(() => ({
  repository: {
    getShopProfile: vi.fn(), findProduct: vi.fn(), findTemplate: vi.fn(), create: vi.fn(), listForProduct: vi.fn(),
  },
  verify: vi.fn(),
  writeAudit: vi.fn(),
  tx: { user: { findUnique: vi.fn().mockResolvedValue({ fullName: 'Admin User', username: 'admin' }) } },
}));
vi.mock('./print-snapshot.repository', () => ({ PrintSnapshotRepository: repository }));
vi.mock('../../../lib/admin-verification', () => ({ verifyAdminPassword: verify }));
vi.mock('../../service/audit/service-audit', () => ({ writeServiceAudit: writeAudit }));
vi.mock('../../financial/infrastructure/transaction', () => ({ runFinancialTransaction: (operation: (client: unknown) => unknown) => operation(tx) }));

import { PrintSnapshotService } from './print-snapshot.service';

const actor = { userId: '11111111-1111-4111-8111-111111111111', role: Role.ADMIN, username: 'admin' };
const context = { requestId: 'request-1', ipAddress: '127.0.0.1' };
const input = {
  productId: '33333333-3333-4333-8333-333333333333',
  templateId: '20000000-0000-4000-8000-000000000001',
  snapshot: { name: 'Washer', price: '499.00' }, validUntil: new Date('2026-10-31T00:00:00.000Z'),
  currencyCode: 'USD', publicPrice: '499.00', staffLabelCode: null, barcodeValue: '2000000000015',
  copiesPrinted: 1, hiddenPricingPresetId: null, encodingPresetId: null, accountPassword: 'secret',
};

describe('PrintSnapshotService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repository.getShopProfile.mockResolvedValue({ snapshotPrintedCards: true });
    repository.findProduct.mockResolvedValue({ id: input.productId });
    repository.findTemplate.mockResolvedValue({ id: input.templateId });
    repository.create.mockResolvedValue({ id: '44444444-4444-4444-8444-444444444444', ...input, generatedAt: new Date() });
  });

  it('records and audits the immutable print-time values when snapshots are enabled', async () => {
    const result = await PrintSnapshotService.recordPrint(input, actor, context);
    expect(result.recorded).toBe(true);
    expect(repository.create).toHaveBeenCalledWith(expect.objectContaining({
      productId: input.productId, templateId: input.templateId, publicPrice: expect.anything(), generatedById: actor.userId,
    }), tx);
    expect(writeAudit).toHaveBeenCalledWith(expect.objectContaining({ recordId: '44444444-4444-4444-8444-444444444444' }), tx);
  });

  it('returns recorded false without inserting or auditing when snapshots are disabled', async () => {
    repository.getShopProfile.mockResolvedValue({ snapshotPrintedCards: false });
    await expect(PrintSnapshotService.recordPrint(input, actor, context)).resolves.toEqual({ recorded: false, print: null });
    expect(repository.create).not.toHaveBeenCalled();
    expect(writeAudit).not.toHaveBeenCalled();
  });

  it.each([
    ['product', 'findProduct', 'Product not found'],
    ['template', 'findTemplate', 'Pricing card template not found'],
  ] as const)('rejects an unknown %s', async (_kind, method, message) => {
    repository[method].mockResolvedValueOnce(null);
    await expect(PrintSnapshotService.recordPrint(input, actor, context)).rejects.toThrow(message);
    expect(repository.create).not.toHaveBeenCalled();
  });
});
