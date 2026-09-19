import { useQuery } from '@tanstack/react-query';
import { pricingCardApi } from '../api/pricing-card.api';

export const shopProfileKey = ['shop-profile'] as const;

export function useShopProfile() {
  return useQuery({ queryKey: shopProfileKey, queryFn: pricingCardApi.shopProfile });
}
