import { PricingCalculationMode, PricingRoundingMode } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PricingPresetsService } from './pricing-presets.service';

const { repository, verify, writeAudit, labelSecretSettings } = vi.hoisted(() => ({
  repository: { findById: vi.fn(), findDuplicateName: vi.fn(), create: vi.fn(), update: vi.fn(), clearDefault: vi.fn(), list: vi.fn() },
  verify: vi.fn(), writeAudit: vi.fn(),
  labelSecretSettings: { findFirst: vi.fn(), update: vi.fn() },
}));
vi.mock('./pricing-presets.repository', () => ({ PricingPresetsRepository: repository }));
vi.mock('../../../lib/admin-verification', () => ({ verifyAdminPassword: verify }));
vi.mock('../../service/audit/service-audit', () => ({ writeServiceAudit: writeAudit }));
vi.mock('../../financial/infrastructure/transaction', () => ({ runFinancialTransaction: (callback: (tx: unknown) => unknown) => callback({ user: { findUnique: vi.fn().mockResolvedValue({ fullName: 'Admin', username: 'admin' }) }, labelSecretSettings }) }));

const preset = {
  id: '33333333-3333-4333-8333-333333333333', name: 'AC', productType: null,
  expensePercent: { toString: () => '10' }, profitPercent: { toString: () => '7' },
  discountBufferPercent: { toString: () => '7' }, installmentMarkupPercent: { toString: () => '20' },
  downPaymentPercent: { toString: () => '40' }, defaultInstallmentMonths: 3,
  calculationMode: PricingCalculationMode.COMPOUND, roundingMode: PricingRoundingMode.NONE,
  isDefault: false, isLabelSecretAllowed: false, isActive: true, notes: null, archivedAt: null, archivedReason: null,
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
    labelSecretSettings.findFirst.mockResolvedValue(null);
    labelSecretSettings.update.mockResolvedValue({});
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

  it('chooses one secret label preset with a verified password and an audit', async () => {
    const result = await PricingPresetsService.setLabelSecret(preset.id, { accountPassword: 'secret' }, user, context);
    expect(verify).toHaveBeenCalledWith(user.userId, 'secret', expect.objectContaining({ action: 'SET_LABEL_SECRET_PRICING_PRESET' }), expect.anything());
    expect(result.isLabelSecretAllowed).toBe(true);
    expect(writeAudit).toHaveBeenCalledWith(expect.objectContaining({ beforeValues: { isLabelSecretAllowed: false }, afterValues: { isLabelSecretAllowed: true } }), expect.anything());
  });

  it('clears the secret label preset with a verified password and an audit', async () => {
    repository.findById.mockResolvedValue({ ...preset, isLabelSecretAllowed: true });
    const result = await PricingPresetsService.clearLabelSecret(preset.id, { accountPassword: 'secret' }, user, context);
    expect(verify).toHaveBeenCalledWith(user.userId, 'secret', expect.objectContaining({ action: 'CLEAR_LABEL_SECRET_PRICING_PRESET' }), expect.anything());
    expect(result.isLabelSecretAllowed).toBe(false);
    expect(writeAudit).toHaveBeenCalledTimes(1);
  });

  it('atomically clears the default when removing the default hidden preset', async () => {
    repository.findById.mockResolvedValue({ ...preset, isLabelSecretAllowed: true });
    labelSecretSettings.findFirst.mockResolvedValue({ id: 'settings-1', defaultPricingPresetId: preset.id });

    const result = await PricingPresetsService.clearLabelSecret(preset.id, { accountPassword: 'secret' }, user, context);

    expect(labelSecretSettings.update).toHaveBeenCalledWith({
      where: { id: 'settings-1' },
      data: { defaultPricingPresetId: null, updatedById: user.userId },
    });
    expect(repository.update).toHaveBeenCalledWith(preset.id, { isLabelSecretAllowed: false, updatedById: user.userId }, expect.anything());
    expect(writeAudit).toHaveBeenCalledWith(expect.objectContaining({
      beforeValues: { isLabelSecretAllowed: true, defaultHiddenPricingPresetId: preset.id },
      afterValues: { isLabelSecretAllowed: false, defaultHiddenPricingPresetId: null },
    }), expect.anything());
    expect(result.isLabelSecretAllowed).toBe(false);
  });

  it('refuses to make an archived preset the secret label preset', async () => {
    repository.findById.mockResolvedValue({ ...preset, isActive: false, archivedAt: new Date() });
    await expect(PricingPresetsService.setLabelSecret(preset.id, { accountPassword: 'secret' }, user, context)).rejects.toMatchObject({ code: 'PRICING_PRESET_INACTIVE' });
    expect(verify).not.toHaveBeenCalled();
  });

  it('refuses to archive the secret label preset until it is cleared', async () => {
    repository.findById.mockResolvedValue({ ...preset, isLabelSecretAllowed: true });
    await expect(PricingPresetsService.archive(preset.id, { reason: 'Retire old formula', accountPassword: 'secret' }, user, context)).rejects.toMatchObject({ code: 'LABEL_SECRET_PRICING_PRESET' });
    expect(verify).not.toHaveBeenCalled();
  });

  it('only lets a pricing admin choose the secret label preset', async () => {
    await expect(PricingPresetsService.setLabelSecret(preset.id, { accountPassword: 'secret' }, { ...user, role: 'EMPLOYEE' }, context)).rejects.toBeDefined();
    expect(repository.update).not.toHaveBeenCalled();
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
