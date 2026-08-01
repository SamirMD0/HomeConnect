import { PricingCalculationMode, PricingRoundingMode } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PricingPresetsService } from './pricing-presets.service';

const { repository, verify, writeAudit } = vi.hoisted(() => ({
  repository: { findById: vi.fn(), findDuplicateName: vi.fn(), create: vi.fn(), update: vi.fn(), clearDefault: vi.fn(), list: vi.fn() },
  verify: vi.fn(), writeAudit: vi.fn(),
}));
vi.mock('./pricing-presets.repository', () => ({ PricingPresetsRepository: repository }));
vi.mock('../../../lib/admin-verification', () => ({ verifyAdminPassword: verify }));
vi.mock('../../service/audit/service-audit', () => ({ writeServiceAudit: writeAudit }));
vi.mock('../../financial/infrastructure/transaction', () => ({ runFinancialTransaction: (callback: (tx: unknown) => unknown) => callback({ user: { findUnique: vi.fn().mockResolvedValue({ fullName: 'Admin', username: 'admin' }) } }) }));

const preset = {
  id: '33333333-3333-4333-8333-333333333333', name: 'AC', productType: null,
  expensePercent: { toString: () => '10' }, profitPercent: { toString: () => '7' },
  discountBufferPercent: { toString: () => '7' }, installmentMarkupPercent: { toString: () => '20' },
  downPaymentPercent: { toString: () => '40' }, defaultInstallmentMonths: 3,
  calculationMode: PricingCalculationMode.COMPOUND, roundingMode: PricingRoundingMode.NONE,
  isDefault: false, isActive: true, notes: null, archivedAt: null, archivedReason: null,
  createdById: '11111111-1111-4111-8111-111111111111', updatedById: null,
  createdAt: new Date(), updatedAt: new Date(),
};
const user = { userId: preset.createdById, role: 'ADMIN', username: 'admin' };
const context = { requestId: null, ipAddress: null };

describe('pricing preset service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repository.findById.mockResolvedValue(preset);
    repository.findDuplicateName.mockResolvedValue(null);
    repository.update.mockImplementation((_id, data) => Promise.resolve({ ...preset, ...data }));
  });

  it('sets one default transactionally and writes one audit', async () => {
    const result = await PricingPresetsService.setDefault(preset.id, { reason: 'Use AC by default', accountPassword: 'secret' }, user, context);
    expect(repository.clearDefault).toHaveBeenCalledWith(preset.id, expect.anything());
    expect(result.isDefault).toBe(true);
    expect(writeAudit).toHaveBeenCalledTimes(1);
  });

  it('refuses to archive the current default', async () => {
    repository.findById.mockResolvedValue({ ...preset, isDefault: true });
    await expect(PricingPresetsService.archive(preset.id, { reason: 'Retire old formula', accountPassword: 'secret' }, user, context)).rejects.toMatchObject({ code: 'DEFAULT_PRICING_PRESET' });
    expect(verify).not.toHaveBeenCalled();
  });

  it('does not place the account password in audit values', async () => {
    repository.create.mockResolvedValue(preset);
    await PricingPresetsService.create({
      name: 'AC', productType: null, expensePercent: '10', profitPercent: '7', discountBufferPercent: '7',
      installmentMarkupPercent: '20', downPaymentPercent: '40', defaultInstallmentMonths: 3,
      calculationMode: PricingCalculationMode.COMPOUND, roundingMode: PricingRoundingMode.NONE,
      notes: null, reason: 'Create AC formula', accountPassword: 'secret',
    }, user, context);
    const auditPayload = writeAudit.mock.calls[0][0];
    expect(JSON.stringify(auditPayload)).not.toContain('secret');
    expect(JSON.stringify(auditPayload)).not.toContain('accountPassword');
  });
});
