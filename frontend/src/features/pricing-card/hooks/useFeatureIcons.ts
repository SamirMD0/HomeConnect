import { useQuery } from '@tanstack/react-query';
import { pricingCardApi } from '../api/pricing-card.api';

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
