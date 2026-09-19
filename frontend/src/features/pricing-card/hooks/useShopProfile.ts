import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { pricingCardApi } from '../api/pricing-card.api';

export const shopProfileKey = ['shop-profile'] as const;

export function useShopProfile() {
  return useQuery({ queryKey: shopProfileKey, queryFn: pricingCardApi.shopProfile });
}

export function useUpdateShopProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: pricingCardApi.updateShopProfile,
    onSuccess: (profile) => {
      queryClient.setQueryData(shopProfileKey, profile);
    },
  });
}

export function useUpdateShopProfileLogo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: pricingCardApi.updateShopProfileLogo,
    onSuccess: (profile) => {
      queryClient.setQueryData(shopProfileKey, profile);
    },
  });
}
