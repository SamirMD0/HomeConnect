import { useQuery } from '@tanstack/react-query';
import { pricingCardApi } from '../api/pricing-card.api';

export const pricingCardTemplateKeys = {
  all: ['pricing-card-templates'] as const,
  list: (activeOnly: boolean) => ['pricing-card-templates', 'list', activeOnly] as const,
  detail: (id: string) => ['pricing-card-templates', 'detail', id] as const,
};

export function usePricingCardTemplates(activeOnly = true) {
  return useQuery({ queryKey: pricingCardTemplateKeys.list(activeOnly), queryFn: () => pricingCardApi.templates(activeOnly) });
}

export function usePricingCardTemplate(id: string) {
  return useQuery({ queryKey: pricingCardTemplateKeys.detail(id), queryFn: () => pricingCardApi.template(id), enabled: Boolean(id) });
}
