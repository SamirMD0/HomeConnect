import { useQuery } from '@tanstack/react-query';
import { useDebouncedValue } from '../../../hooks/useDebouncedValue';
import { pricingApi } from '../api/pricing.api';
import { PricingCalculateInput } from '../types/pricing.types';

export function usePricingCalculation(input:PricingCalculateInput|null){
  const debounced=useDebouncedValue(input,300);
  // The backend refuses to calculate without a preset — either an explicit
  // presetId, an active default preset the caller knows about, or the full set
  // of custom overrides. Firing this query for a manual-priced product with
  // no preset returns 400, which the drawer surfaces as an unexpected error.
  // The caller signals "I have a preset or complete overrides" by attaching
  // a presetId or by passing complete overrides.
  const overrides=debounced?.overrides;
  const hasCompleteOverrides = Boolean(
    overrides &&
    overrides.expensePercent !== undefined && overrides.expensePercent !== '' &&
    overrides.profitPercent !== undefined && overrides.profitPercent !== '' &&
    overrides.discountBufferPercent !== undefined && overrides.discountBufferPercent !== '' &&
    overrides.installmentMarkupPercent !== undefined && overrides.installmentMarkupPercent !== '' &&
    overrides.downPaymentPercent !== undefined && overrides.downPaymentPercent !== '' &&
    overrides.calculationMode !== undefined && overrides.roundingMode !== undefined
  );
  const enabled = Boolean(debounced?.costPrice) && (Boolean(debounced?.presetId) || hasCompleteOverrides);
  return useQuery({queryKey:['pricing','calculate',debounced],queryFn:()=>pricingApi.calculate(debounced!),enabled,retry:false});
}
