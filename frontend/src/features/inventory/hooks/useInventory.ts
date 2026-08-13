import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { inventoryApi } from '../api/inventory.api';
import type { CreateStockMovementInput, InventoryListFilters, MovementFilters, VerifyOpeningCountInput } from '../types/inventory.types';

export const inventoryKeys = {
  all: ['inventory'] as const,
  summary: () => [...inventoryKeys.all, 'summary'] as const,
  lowStock: (filters: InventoryListFilters) => [...inventoryKeys.all, 'low-stock', filters] as const,
  movements: (filters: MovementFilters) => [...inventoryKeys.all, 'movements', filters] as const,
  product: (id: string) => [...inventoryKeys.all, 'product', id] as const,
};

export const useInventorySummary = () => useQuery({ queryKey: inventoryKeys.summary(), queryFn: inventoryApi.summary, refetchInterval: 30_000 });
export const useLowStockProducts = (filters: InventoryListFilters = {}) => useQuery({ queryKey: inventoryKeys.lowStock(filters), queryFn: () => inventoryApi.lowStock(filters) });
export const useStockMovements = (filters: MovementFilters = {}) => useQuery({ queryKey: inventoryKeys.movements(filters), queryFn: () => inventoryApi.movements(filters) });
export const useProductInventory = (id: string) => useQuery({ queryKey: inventoryKeys.product(id), queryFn: () => inventoryApi.product(id), enabled: Boolean(id) });

export function useCreateStockMovement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ productId, input }: { productId: string; input: CreateStockMovementInput }) => inventoryApi.createMovement(productId, input),
    onSuccess: (_result, variables) => Promise.all([
      queryClient.invalidateQueries({ queryKey: inventoryKeys.all }),
      queryClient.invalidateQueries({ queryKey: ['products'] }),
      queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      queryClient.invalidateQueries({ queryKey: inventoryKeys.product(variables.productId) }),
    ]),
  });
}

export function useVerifyOpeningCount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ productId, input }: { productId: string; input: VerifyOpeningCountInput }) => inventoryApi.verifyOpeningCount(productId, input),
    onSuccess: (_result, variables) => Promise.all([
      queryClient.invalidateQueries({ queryKey: inventoryKeys.all }),
      queryClient.invalidateQueries({ queryKey: ['products'] }),
      queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      queryClient.invalidateQueries({ queryKey: inventoryKeys.product(variables.productId) }),
    ]),
  });
}
