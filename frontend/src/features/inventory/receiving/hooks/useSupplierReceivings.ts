import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { inventoryKeys } from '../../hooks/useInventory';
import { productKeys } from '../../../products/hooks/useProducts';
import { useDebouncedValue } from '../../../../hooks/useDebouncedValue';
import { supplierReceivingsApi } from '../api/supplier-receivings.api';
import type { CreateSupplierReceivingInput, SupplierReceivingFilters, UpdateReceivingMetadataInput, VoidReceivingInput } from '../types/supplier-receiving.types';

export const supplierReceivingKeys = {
  all: ['supplier-receivings'] as const,
  list: (filters: SupplierReceivingFilters) => [...supplierReceivingKeys.all, 'list', filters] as const,
  detail: (id: string) => [...supplierReceivingKeys.all, 'detail', id] as const,
  duplicate: (supplierId: string, referenceNumber: string) => [...supplierReceivingKeys.all, 'duplicate', supplierId, referenceNumber] as const,
};

export const useSupplierReceivings = (filters: SupplierReceivingFilters = {}, enabled = true) => useQuery({
  queryKey: supplierReceivingKeys.list(filters), queryFn: () => supplierReceivingsApi.list(filters), enabled,
});
export const useSupplierReceiving = (id: string) => useQuery({
  queryKey: supplierReceivingKeys.detail(id), queryFn: () => supplierReceivingsApi.get(id), enabled: Boolean(id),
});
export const useSupplierReceivingDuplicate = (supplierId: string, referenceNumber: string) => {
  const debouncedReference = useDebouncedValue(referenceNumber.trim());
  return useQuery({
    queryKey: supplierReceivingKeys.duplicate(supplierId, debouncedReference),
    queryFn: () => supplierReceivingsApi.duplicateCheck(supplierId, debouncedReference),
    enabled: Boolean(supplierId && debouncedReference),
    retry: false,
  });
};
const invalidateStock = (queryClient: ReturnType<typeof useQueryClient>) => Promise.all([
  queryClient.invalidateQueries({ queryKey: supplierReceivingKeys.all }),
  queryClient.invalidateQueries({ queryKey: inventoryKeys.all }),
  queryClient.invalidateQueries({ queryKey: productKeys.all }),
]);

export function useCreateSupplierReceiving() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSupplierReceivingInput) => supplierReceivingsApi.create(input),
    onSuccess: () => invalidateStock(queryClient),
  });
}
/** Reference and note only — this moves no stock, so only the document caches need refreshing. */
export function useUpdateReceivingMetadata(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateReceivingMetadataInput) => supplierReceivingsApi.updateMetadata(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: supplierReceivingKeys.all }),
  });
}
export function useVoidSupplierReceiving(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: VoidReceivingInput) => supplierReceivingsApi.void(id, input),
    onSuccess: () => invalidateStock(queryClient),
  });
}
