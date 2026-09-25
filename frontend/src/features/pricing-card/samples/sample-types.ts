import type { PricingCardAssets } from '../components/PricingCard';
import type { PricingCardData } from '../types/pricing-card.types';

export interface PricingCardSample {
  name: string;
  product: PricingCardData;
  assets?: PricingCardAssets;
}

export const sampleAssets: PricingCardAssets = {
  companyLogoUrl: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 12"%3E%3Crect width="40" height="12" fill="%231d4ed8"/%3E%3C/svg%3E',
};

export const icon = (label: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><title>${label}</title><path d="M4 12h16M12 4v16"/></svg>`;
