import { api } from '../../../services/api';
import type {
  BrandLogo,
  PricingCardFeatureIcon,
  PricingCardQuery,
  PricingCardResult,
  PricingCardSecretPreviewInput,
  PricingCardsResult,
  PricingCardTemplate,
  RecordPricingCardPrintInput,
  ShopProfile,
  UpdateShopProfileInput,
  UpdateShopProfileLogoInput,
  FeatureIconInput,
} from '../types/pricing-card.types';

const labelParams = (query: PricingCardQuery) => ({
  ...query,
  featureCodes: query.featureCodes?.join(','),
  includePriceCode: query.includePriceCode ?? false,
  includePrice: query.includePrice ?? true,
});

export const pricingCardApi = {
  shopProfile: async (): Promise<ShopProfile> => (await api.get('/shop-profile')).data.data,
  updateShopProfile: async (input: UpdateShopProfileInput): Promise<ShopProfile> =>
    (await api.patch('/shop-profile', input)).data.data,
  updateShopProfileLogo: async (input: UpdateShopProfileLogoInput): Promise<ShopProfile> =>
    (await api.put('/shop-profile/logo', input)).data.data,
  templates: async (activeOnly = true): Promise<PricingCardTemplate[]> =>
    (await api.get('/pricing-card-templates', { params: { activeOnly } })).data.data,
  template: async (templateId: string): Promise<PricingCardTemplate> =>
    (await api.get(`/pricing-card-templates/${templateId}`)).data.data,
  featureIcons: async (activeOnly = true, category?: string): Promise<PricingCardFeatureIcon[]> =>
    (await api.get('/pricing-card-feature-icons', { params: { activeOnly, category } })).data.data,
  createFeatureIcon: async (input: FeatureIconInput): Promise<PricingCardFeatureIcon> =>
    (await api.post('/pricing-card-feature-icons', input)).data.data,
  updateFeatureIcon: async (id: string, input: FeatureIconInput): Promise<PricingCardFeatureIcon> =>
    (await api.patch(`/pricing-card-feature-icons/${id}`, input)).data.data,
  archiveFeatureIcon: async (id: string, accountPassword: string): Promise<PricingCardFeatureIcon> =>
    (await api.post(`/pricing-card-feature-icons/${id}/archive`, { accountPassword })).data.data,
  brandLogos: async (activeOnly = true): Promise<BrandLogo[]> =>
    (await api.get('/brand-logos', { params: { activeOnly } })).data.data,
  pricingCard: async (productId: string, query: PricingCardQuery): Promise<PricingCardResult> =>
    (await api.get(`/products/${productId}/pricing-card`, { params: labelParams(query) })).data.data,
  pricingCards: async (productIds: string[], query: PricingCardQuery): Promise<PricingCardsResult> =>
    (await api.get('/products/pricing-cards', { params: { ...labelParams(query), ids: productIds.join(',') } })).data.data,
  pricingCardSecretPreview: async (productId: string, input: PricingCardSecretPreviewInput): Promise<PricingCardResult> =>
    (await api.post(`/products/${productId}/pricing-card/secret-preview`, input)).data.data,
  recordPrint: async (input: RecordPricingCardPrintInput): Promise<{ recorded: boolean; print: unknown | null }> =>
    (await api.post('/products/pricing-cards/print-snapshot', input)).data.data,
};
