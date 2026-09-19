import { useQuery } from '@tanstack/react-query';
import { pricingCardApi } from '../api/pricing-card.api';

export const brandLogoKeys = {
  all: ['brand-logos'] as const,
  list: (activeOnly: boolean) => ['brand-logos', 'list', activeOnly] as const,
};

export function useBrandLogos(activeOnly = true) {
  return useQuery({ queryKey: brandLogoKeys.list(activeOnly), queryFn: () => pricingCardApi.brandLogos(activeOnly) });
}
