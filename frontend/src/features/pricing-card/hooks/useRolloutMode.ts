import { useShopProfile } from './useShopProfile';
import type { PricingCardRolloutMode } from '../types/pricing-card.types';

/**
 * Reads ShopProfile.pricingCardRolloutMode and answers the two questions every
 * label/pricing-card surface needs: is legacy still allowed, is the new
 * pricing-card UI allowed. Defaults to "both on" while the profile is loading
 * so we never blank a surface a returning user just saw.
 */
export function useRolloutMode(): { mode: PricingCardRolloutMode; legacyEnabled: boolean; pricingCardEnabled: boolean; isLoading: boolean } {
  const profile = useShopProfile();
  const mode = profile.data?.pricingCardRolloutMode ?? 'BOTH';
  return {
    mode,
    legacyEnabled: mode === 'BOTH' || mode === 'LEGACY_ONLY',
    pricingCardEnabled: mode === 'BOTH' || mode === 'TEMPLATE_ONLY',
    isLoading: profile.isLoading,
  };
}
