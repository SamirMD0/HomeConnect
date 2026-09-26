import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { pricingCardApi } from '../api/pricing-card.api';
import type { BrandLogoInput } from '../types/pricing-card.types';

export const brandLogoKeys = {
  all: ['brand-logos'] as const,
  list: (activeOnly: boolean) => ['brand-logos', 'list', activeOnly] as const,
};

export function useBrandLogos(activeOnly = true) {
  return useQuery({ queryKey: brandLogoKeys.list(activeOnly), queryFn: () => pricingCardApi.brandLogos(activeOnly) });
}

export function useCreateBrandLogo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: BrandLogoInput) => pricingCardApi.createBrandLogo(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: brandLogoKeys.all }),
  });
}

export function useUpdateBrandLogo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: BrandLogoInput }) => pricingCardApi.updateBrandLogo(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: brandLogoKeys.all }),
  });
}

export function useArchiveBrandLogo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string }) => pricingCardApi.archiveBrandLogo(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: brandLogoKeys.all }),
  });
}
