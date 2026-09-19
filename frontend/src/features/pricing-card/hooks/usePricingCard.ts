import { useMutation, useQuery } from '@tanstack/react-query';
import { pricingCardApi } from '../api/pricing-card.api';
import type { PricingCardQuery, RecordPricingCardPrintInput } from '../types/pricing-card.types';

export const pricingCardKeys = {
  all: ['pricing-cards'] as const,
  single: (productId: string, query: PricingCardQuery) => ['pricing-cards', 'single', productId, query] as const,
  bulk: (productIds: string[], query: PricingCardQuery) => ['pricing-cards', 'bulk', [...productIds].sort().join(','), query] as const,
};

export function usePricingCard(productId: string, query: PricingCardQuery) {
  return useQuery({
    queryKey: pricingCardKeys.single(productId, query),
    queryFn: () => pricingCardApi.pricingCard(productId, query),
    enabled: Boolean(productId && query.templateId),
  });
}

export function usePricingCards(productIds: string[], query: PricingCardQuery) {
  return useQuery({
    queryKey: pricingCardKeys.bulk(productIds, query),
    queryFn: () => pricingCardApi.pricingCards(productIds, query),
    enabled: productIds.length > 0 && Boolean(query.templateId),
  });
}

export function useRecordPricingCardPrint() {
  return useMutation({ mutationFn: (input: RecordPricingCardPrintInput) => pricingCardApi.recordPrint(input) });
}
