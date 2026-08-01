import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useDebouncedValue } from '../../../hooks/useDebouncedValue';
import { pricingApi } from '../api/pricing.api';
import { CreatePricingPresetInput, PricingPresetFilters, PricingProtectedAction, UpdatePricingPresetInput } from '../types/pricing.types';

export const pricingKeys={all:['pricing-presets'] as const,list:(filters:PricingPresetFilters)=>['pricing-presets','list',filters] as const,detail:(id:string)=>['pricing-presets','detail',id] as const,audit:(id:string)=>['pricing-presets','audit',id] as const};
export function usePricingPresets(filters:PricingPresetFilters={}){const search=useDebouncedValue(filters.search??'',300);const normalized={...filters,search:search||undefined};return useQuery({queryKey:pricingKeys.list(normalized),queryFn:()=>pricingApi.list(normalized)});}
export const usePricingPreset=(id:string)=>useQuery({queryKey:pricingKeys.detail(id),queryFn:()=>pricingApi.get(id),enabled:Boolean(id)});
export const usePricingPresetAudit=(id:string,enabled=true)=>useQuery({queryKey:pricingKeys.audit(id),queryFn:()=>pricingApi.audit(id),enabled:Boolean(id)&&enabled});
function mutation<T>(fn:(value:T)=>Promise<unknown>){return function usePricingMutation(){const client=useQueryClient();return useMutation({mutationFn:fn,onSuccess:()=>client.invalidateQueries({queryKey:pricingKeys.all})});};}
export const useCreatePricingPreset=mutation<CreatePricingPresetInput>((input)=>pricingApi.create(input));
export const useUpdatePricingPreset=mutation<{id:string;input:UpdatePricingPresetInput}>(({id,input})=>pricingApi.update(id,input));
export const useArchivePricingPreset=mutation<{id:string;input:PricingProtectedAction}>(({id,input})=>pricingApi.archive(id,input));
export const useRestorePricingPreset=mutation<{id:string;input:PricingProtectedAction}>(({id,input})=>pricingApi.restore(id,input));
export const useSetDefaultPricingPreset=mutation<{id:string;input:PricingProtectedAction}>(({id,input})=>pricingApi.setDefault(id,input));
