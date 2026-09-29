import { useQuery } from '@tanstack/react-query';
import { pricingCardApi } from '../api/pricing-card.api';

export const pricingCardIndexKeys = {
  all: ['pricing-card-index'] as const,
  batch: (productIds: string[]) => ['pricing-card-index', 'batch', [...productIds].sort().join(',')] as const,
};

/**
 * Batch-resolves the template each product id would print with today, using
 * the shop profile's category default map and the per-product override. Returns
 * `resolvedTemplateId: null, missingTemplate: true` for products with no
 * category default and no override.
 */
export function usePricingCardIndex(productIds: string[]) {
  return useQuery({
    queryKey: pricingCardIndexKeys.batch(productIds),
    queryFn: () => pricingCardApi.pricingCardIndex(productIds),
    enabled: productIds.length > 0,
    staleTime: 30_000,
  });
}
