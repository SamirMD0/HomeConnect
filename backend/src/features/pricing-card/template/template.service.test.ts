import { PricingCardPaperMode } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { minimumTemplateConfig } from './pricing-card-template-config.fixture';
import { PricingCardTemplateService } from './template.service';

const { repository, verify, writeAudit, actor } = vi.hoisted(() => ({
  repository: { list: vi.fn(), findById: vi.fn(), findByName: vi.fn(), create: vi.fn(), update: vi.fn() },
  verify: vi.fn(), writeAudit: vi.fn(), actor: { findUnique: vi.fn() },
}));
vi.mock('./template.repository', () => ({ PricingCardTemplateRepository: repository }));
vi.mock('../../../lib/admin-verification', () => ({ verifyAdminPassword: verify }));
vi.mock('../../service/audit/service-audit', () => ({ writeServiceAudit: writeAudit }));
vi.mock('../../financial/infrastructure/transaction', () => ({ runFinancialTransaction: (callback: (tx: unknown) => unknown) => callback({ user: actor }) }));

const user = { userId: '11111111-1111-4111-8111-111111111111', role: 'ADMIN' };
const context = { requestId: null, ipAddress: null };
const input = { name: 'TV Large Card', description: null, paperMode: PricingCardPaperMode.SINGLE_STICKER, paperSize: null, cardWidthMm: 148, cardHeightMm: 105, config: minimumTemplateConfig, featureMax: 6, specKeyOrder: ['screen_size'], defaultValidityDays: 30 };
const row = { id: '20000000-0000-4000-8000-000000000001', ...input, cardWidthMm: new Decimal(148), cardHeightMm: new Decimal(105), configVersion: 1, createdById: user.userId, updatedById: user.userId, isActive: true, archivedAt: null, archivedReason: null, createdAt: new Date(), updatedAt: new Date() };

describe('pricing card template service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repository.findByName.mockResolvedValue(null);
    repository.create.mockResolvedValue(row);
    actor.findUnique.mockResolvedValue({ fullName: 'Admin', username: 'admin' });
  });

  it('verifies the password and audits template creation', async () => {
    await PricingCardTemplateService.createTemplate(input, user, context);
    expect(verify).not.toHaveBeenCalled();
    expect(repository.create).toHaveBeenCalledWith(expect.objectContaining({ configVersion: 1, featureMax: 6 }), expect.anything());
    expect(writeAudit).toHaveBeenCalledWith(expect.objectContaining({ recordType: 'PRICING_CARD_TEMPLATE', action: 'CREATE' }), expect.anything());
  });
});
