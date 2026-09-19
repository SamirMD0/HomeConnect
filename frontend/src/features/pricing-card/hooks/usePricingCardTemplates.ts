import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { pricingCardApi } from '../api/pricing-card.api';
import type { ArchiveTemplateInput, PricingCardTemplateInput } from '../types/pricing-card.types';

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

export function useCreatePricingCardTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: PricingCardTemplateInput) => pricingCardApi.createTemplate(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: pricingCardTemplateKeys.all }),
  });
}

export function useUpdatePricingCardTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: PricingCardTemplateInput }) => pricingCardApi.updateTemplate(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: pricingCardTemplateKeys.all }),
  });
}

export function useArchivePricingCardTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ArchiveTemplateInput }) => pricingCardApi.archiveTemplate(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: pricingCardTemplateKeys.all }),
  });
}
