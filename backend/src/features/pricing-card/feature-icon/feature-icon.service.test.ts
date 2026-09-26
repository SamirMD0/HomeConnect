import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FeatureIconService } from './feature-icon.service';

const { repository, verify, writeAudit, actor } = vi.hoisted(() => ({
  repository: { list: vi.fn(), findById: vi.fn(), getByCode: vi.fn(), create: vi.fn(), update: vi.fn() },
  verify: vi.fn(), writeAudit: vi.fn(), actor: { findUnique: vi.fn() },
}));
vi.mock('./feature-icon.repository', () => ({ FeatureIconRepository: repository }));
vi.mock('../../../lib/admin-verification', () => ({ verifyAdminPassword: verify }));
vi.mock('../../service/audit/service-audit', () => ({ writeServiceAudit: writeAudit }));
vi.mock('../../financial/infrastructure/transaction', () => ({ runFinancialTransaction: (callback: (tx: unknown) => unknown) => callback({ user: actor }) }));

const user = { userId: '11111111-1111-4111-8111-111111111111', role: 'ADMIN' };
const context = { requestId: null, ipAddress: null };
const input = { code: 'qled', label: 'QLED', category: 'tv', svg: '<svg viewBox="0 0 24 24"><path d="M1 1h2v2z"/></svg>', sortOrder: 1, isActive: true };
const row = { id: '10000000-0000-4000-8000-000000000001', ...input, svg: '<svg viewBox="0 0 24 24"><path d="M1 1h2v2z"></path></svg>', createdById: user.userId, updatedById: user.userId, createdAt: new Date(), updatedAt: new Date() };

describe('feature icon service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repository.getByCode.mockResolvedValue(null);
    repository.create.mockResolvedValue(row);
    actor.findUnique.mockResolvedValue({ fullName: 'Admin', username: 'admin' });
  });

  it('sanitizes at write time, verifies the password, and writes an audit', async () => {
    await FeatureIconService.createFeatureIcon({ ...input, svg: '<svg viewBox="0 0 24 24" onclick="x"><path d="M1 1h2v2z"/></svg>' }, user, context);
    expect(verify).not.toHaveBeenCalled();
    expect(repository.create).toHaveBeenCalledWith(expect.objectContaining({ svg: expect.not.stringContaining('onclick') }), expect.anything());
    expect(writeAudit).toHaveBeenCalledWith(expect.objectContaining({ recordType: 'PRICING_CARD_FEATURE_ICON', action: 'CREATE' }), expect.anything());
  });
});
