import { useQuery } from '@tanstack/react-query';
import { useDebouncedValue } from '../../../hooks/useDebouncedValue';
import { pricingApi } from '../api/pricing.api';
import { PricingCalculateInput } from '../types/pricing.types';

export function usePricingCalculation(input:PricingCalculateInput|null){const debounced=useDebouncedValue(input,300);return useQuery({queryKey:['pricing','calculate',debounced],queryFn:()=>pricingApi.calculate(debounced!),enabled:Boolean(debounced?.costPrice),retry:false});}
