import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { pricingCardApi } from '../api/pricing-card.api';
import type { FeatureIconInput } from '../types/pricing-card.types';

export const featureIconKeys = {
  all: ['pricing-card-feature-icons'] as const,
  list: (activeOnly: boolean, category?: string) => ['pricing-card-feature-icons', 'list', activeOnly, category ?? 'all'] as const,
};

export function useFeatureIcons(activeOnly = true, category?: string) {
  return useQuery({
    queryKey: featureIconKeys.list(activeOnly, category),
    queryFn: () => pricingCardApi.featureIcons(activeOnly, category),
  });
}

export function useCreateFeatureIcon() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: FeatureIconInput) => pricingCardApi.createFeatureIcon(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: featureIconKeys.all }),
  });
}

export function useUpdateFeatureIcon() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: FeatureIconInput }) => pricingCardApi.updateFeatureIcon(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: featureIconKeys.all }),
  });
}

export function useArchiveFeatureIcon() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, accountPassword }: { id: string; accountPassword: string }) => pricingCardApi.archiveFeatureIcon(id, accountPassword),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: featureIconKeys.all }),
  });
}
