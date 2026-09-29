import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { businessSettingsApi } from '../api/business-settings.api';
import type { UpdateBusinessSettingsInput } from '../types/document.types';

export const businessSettingsKey = ['business-settings'] as const;

export function useBusinessSettings() {
  return useQuery({ queryKey: businessSettingsKey, queryFn: businessSettingsApi.get });
}

export function useUpdateBusinessSettings() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateBusinessSettingsInput) => businessSettingsApi.update(input),
    onSuccess: (settings) => client.setQueryData(businessSettingsKey, settings),
  });
}
