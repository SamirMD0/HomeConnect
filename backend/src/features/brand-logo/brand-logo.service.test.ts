import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BrandLogoService } from './brand-logo.service';

const { repository, verify, writeAudit, actor } = vi.hoisted(() => ({
  repository: { list: vi.fn(), findById: vi.fn(), findByCanonical: vi.fn(), create: vi.fn(), update: vi.fn() },
  verify: vi.fn(), writeAudit: vi.fn(), actor: { findUnique: vi.fn() },
}));
vi.mock('./brand-logo.repository', () => ({ BrandLogoRepository: repository }));
vi.mock('../../lib/admin-verification', () => ({ verifyAdminPassword: verify }));
vi.mock('../service/audit/service-audit', () => ({ writeServiceAudit: writeAudit }));
vi.mock('../financial/infrastructure/transaction', () => ({ runFinancialTransaction: (callback: (tx: unknown) => unknown) => callback({ user: actor }) }));

const user = { userId: '11111111-1111-4111-8111-111111111111', role: 'ADMIN' };
const context = { requestId: 'brand-test', ipAddress: null };
const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const row = {
  id: '33333333-3333-4333-8333-333333333333', canonicalName: 'samsung', displayName: 'Samsung',
  logoBytes: pngBytes, logoMimeType: 'image/png', logoByteSize: pngBytes.length, isActive: true,
  createdById: user.userId, createdAt: new Date(), updatedAt: new Date(),
};

describe('brand logo service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repository.findByCanonical.mockResolvedValue(null);
    repository.create.mockResolvedValue(row);
    actor.findUnique.mockResolvedValue({ fullName: 'Admin', username: 'admin' });
  });

  it('verifies admin password, validates image bytes, and audits creation', async () => {
    const result = await BrandLogoService.createBrandLogo({
      displayName: ' Samsung ', dataBase64: pngBytes.toString('base64'), mimeType: 'image/png',
    }, user, context);

    expect(verify).not.toHaveBeenCalled();
    expect(repository.create).toHaveBeenCalledWith(expect.objectContaining({ canonicalName: 'samsung', logoByteSize: pngBytes.length }), expect.anything());
    expect(writeAudit).toHaveBeenCalledWith(expect.objectContaining({ recordType: 'BRAND_LOGO', action: 'CREATE' }), expect.anything());
    expect(result).toMatchObject({ canonicalName: 'samsung', hasLogo: true });
    expect(JSON.stringify(writeAudit.mock.calls[0][0])).not.toContain('secret');
  });

  it('rejects a canonical-name collision', async () => {
    repository.findByCanonical.mockResolvedValue(row);
    await expect(BrandLogoService.createBrandLogo({
      displayName: 'Samsung', dataBase64: pngBytes.toString('base64'), mimeType: 'image/png',
    }, user, context)).rejects.toMatchObject({ code: 'BRAND_LOGO_CONFLICT' });
  });
});
