import { CurrencyDisplayMode, PricingCardRolloutMode } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ShopProfileService } from './shop-profile.service';

const { repository, verify, writeAudit, actor } = vi.hoisted(() => ({
  repository: { findSingleton: vi.fn(), updateSingleton: vi.fn() },
  verify: vi.fn(),
  writeAudit: vi.fn(),
  actor: { findUnique: vi.fn() },
}));

vi.mock('./shop-profile.repository', () => ({
  SHOP_PROFILE_ID: '4c2b1e9f-8c4b-4a2f-8a10-30c9a04c6d21',
  ShopProfileRepository: repository,
}));
vi.mock('../../lib/admin-verification', () => ({ verifyAdminPassword: verify }));
vi.mock('../service/audit/service-audit', () => ({ writeServiceAudit: writeAudit }));
vi.mock('../financial/infrastructure/transaction', () => ({
  runFinancialTransaction: (callback: (tx: unknown) => unknown) => callback({ user: actor }),
}));

const profile = {
  id: '4c2b1e9f-8c4b-4a2f-8a10-30c9a04c6d21',
  name: 'Home Connect',
  tagline: null,
  logoBytes: null,
  logoMimeType: null,
  logoByteSize: null,
  currencyCode: 'USD',
  currencyDisplay: CurrencyDisplayMode.SYMBOL,
  defaultPricingCardTemplateId: null,
  defaultCardValidityDays: 30,
  snapshotPrintedCards: true,
  pricingCardRolloutMode: PricingCardRolloutMode.BOTH,
  updatedById: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};
const user = { userId: '11111111-1111-4111-8111-111111111111', role: 'ADMIN' };
const context = { requestId: 'shop-profile-test', ipAddress: '127.0.0.1' };

describe('shop profile service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repository.findSingleton.mockResolvedValue(profile);
    repository.updateSingleton.mockImplementation((data) => Promise.resolve({ ...profile, ...data, name: data.name ?? profile.name }));
    actor.findUnique.mockResolvedValue({ fullName: 'Admin', username: 'admin' });
  });

  it('verifies the password and audits detail mutations without storing the password', async () => {
    await ShopProfileService.updateShopProfile({ name: 'Home Connect Beirut', accountPassword: 'secret' }, user, context);

    expect(verify).toHaveBeenCalledWith(user.userId, 'secret', expect.objectContaining({ action: 'UPDATE_SHOP_PROFILE', recordType: 'SHOP_PROFILE' }), expect.anything());
    expect(writeAudit).toHaveBeenCalledWith(expect.objectContaining({
      recordType: 'SHOP_PROFILE',
      beforeValues: expect.objectContaining({ name: 'Home Connect' }),
      afterValues: expect.objectContaining({ name: 'Home Connect Beirut' }),
    }), expect.anything());
    expect(JSON.stringify(writeAudit.mock.calls[0][0])).not.toContain('secret');
  });

  it('connects the default template relation instead of writing the foreign key scalar', async () => {
    const templateId = '20000000-0000-4000-8000-000000000002';

    await ShopProfileService.updateShopProfile({ defaultPricingCardTemplateId: templateId, accountPassword: 'secret' }, user, context);

    const [data] = repository.updateSingleton.mock.calls[0];
    expect(data).toMatchObject({ defaultPricingCardTemplate: { connect: { id: templateId } } });
    expect(data).not.toHaveProperty('defaultPricingCardTemplateId');
  });

  it('disconnects the default template relation when the template id is cleared', async () => {
    await ShopProfileService.updateShopProfile({ defaultPricingCardTemplateId: null, accountPassword: 'secret' }, user, context);

    const [data] = repository.updateSingleton.mock.calls[0];
    expect(data).toMatchObject({ defaultPricingCardTemplate: { disconnect: true } });
    expect(data).not.toHaveProperty('defaultPricingCardTemplateId');
  });

  it('leaves the default template untouched when the field is omitted', async () => {
    await ShopProfileService.updateShopProfile({ name: 'Home Connect Beirut', accountPassword: 'secret' }, user, context);

    const [data] = repository.updateSingleton.mock.calls[0];
    expect(data.defaultPricingCardTemplate).toBeUndefined();
    expect(data).not.toHaveProperty('defaultPricingCardTemplateId');
  });

  it('stores logo bytes only after password verification and writes an audit', async () => {
    const bytes = Buffer.from('RIFF');
    repository.updateSingleton.mockResolvedValue({ ...profile, logoBytes: bytes, logoMimeType: 'image/webp', logoByteSize: bytes.length });

    const result = await ShopProfileService.updateShopProfileLogo(bytes, 'image/webp', 'secret', user, context);

    expect(verify).toHaveBeenCalledWith(user.userId, 'secret', expect.objectContaining({ action: 'UPDATE_SHOP_PROFILE_LOGO' }), expect.anything());
    expect(repository.updateSingleton).toHaveBeenCalledWith(expect.objectContaining({ logoBytes: bytes, logoByteSize: bytes.length }), expect.anything());
    expect(writeAudit).toHaveBeenCalledTimes(1);
    expect(result.hasLogo).toBe(true);
    expect(result.logoDataUrl).toMatch(/^data:image\/webp;base64,/);
    expect(JSON.stringify(writeAudit.mock.calls[0][0])).not.toContain('data:image/webp');
  });
});
