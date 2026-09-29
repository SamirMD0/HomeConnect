import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { exchangeRatesApi } from '../api/exchange-rates.api';

const queryKey = ['exchange-rates'] as const;

export function useExchangeRates() {
  return useQuery({ queryKey, queryFn: exchangeRatesApi.list });
}

export function useCreateExchangeRate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: exchangeRatesApi.create,
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });
}
