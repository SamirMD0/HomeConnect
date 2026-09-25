import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../../services/api';
import { pricingCardApi } from './pricing-card.api';

vi.mock('../../../services/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn() },
}));

describe('pricingCardApi', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uses the dedicated single pricing-card endpoint and preserves its payload shape', async () => {
    const result = { payload: { id: 'product-1' }, warnings: [] };
    vi.mocked(api.get).mockResolvedValue({ data: { data: result } });

    await expect(pricingCardApi.pricingCard('product-1', { templateId: 'template-1' })).resolves.toBe(result);
    expect(api.get).toHaveBeenCalledWith('/products/product-1/pricing-card', {
      params: { templateId: 'template-1', includePriceCode: false, includePrice: true, featureCodes: undefined },
    });
  });

  it('uses the dedicated bulk endpoint with stable CSV query values', async () => {
    const result = { labels: [], warnings: [] };
    vi.mocked(api.get).mockResolvedValue({ data: { data: result } });

    await expect(pricingCardApi.pricingCards(['product-2', 'product-1'], {
      templateId: 'template-1', featureCodes: ['wifi', 'qled'],
    })).resolves.toBe(result);
    expect(api.get).toHaveBeenCalledWith('/products/pricing-cards', {
      params: {
        ids: 'product-2,product-1', templateId: 'template-1', featureCodes: 'wifi,qled',
        includePriceCode: false, includePrice: true,
      },
    });
  });

  it('patches the shop profile without any password payload', async () => {
    const profile = { id: 'shop-1', name: 'Home Connect Beirut' };
    vi.mocked(api.patch).mockResolvedValue({ data: { data: profile } });

    await expect(pricingCardApi.updateShopProfile({ name: 'Home Connect Beirut' })).resolves.toBe(profile);
    expect(api.patch).toHaveBeenCalledWith('/shop-profile', { name: 'Home Connect Beirut' });
  });

  it('puts the shop profile logo bytes as base64', async () => {
    const profile = { id: 'shop-1', hasLogo: true };
    vi.mocked(api.put).mockResolvedValue({ data: { data: profile } });

    await expect(pricingCardApi.updateShopProfileLogo({ dataBase64: 'AAA', mimeType: 'image/png' })).resolves.toBe(profile);
    expect(api.put).toHaveBeenCalledWith('/shop-profile/logo', { dataBase64: 'AAA', mimeType: 'image/png' });
  });

  it('posts template-aware secret previews to the pricing-card endpoint', async () => {
    const result = { payload: { id: 'product-1' }, warnings: [] };
    vi.mocked(api.post).mockResolvedValue({ data: { data: result } });
    const input = {
      templateId: 'template-1', includePriceCode: true, includePrice: true,
      hiddenPricingPresetId: 'preset-1', encodingPresetId: 'encoding-1', accountPassword: 'secret',
    };

    await expect(pricingCardApi.pricingCardSecretPreview('product-1', input)).resolves.toBe(result);
    expect(api.post).toHaveBeenCalledWith('/products/product-1/pricing-card/secret-preview', input);
  });
});
