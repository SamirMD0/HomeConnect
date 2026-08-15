import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { useDebouncedValue } from '../../../hooks/useDebouncedValue';
import { inventoryKeys } from '../../inventory/hooks/useInventory';
import { supplierReceivingKeys } from '../../inventory/receiving/hooks/useSupplierReceivings';
import { productKeys } from '../../products/hooks/useProducts';
import { supplierPurchasesApi } from '../api/supplier-purchases.api';
import type { CreateSupplierPurchaseInput } from '../types/supplier-purchase.types';
import { supplierKeys } from './useSuppliers';
import { supplierLedgerKeyPrefix } from './useSupplierLedger';

export const supplierPurchaseKeys = {
  all: ['supplier-purchases'] as const,
  list: (supplierId: string, page: number) => [...supplierPurchaseKeys.all, 'list', supplierId, page] as const,
  detail: (id: string) => [...supplierPurchaseKeys.all, 'detail', id] as const,
  receipt: (supplierId: string, receiptNumber: string) => [...supplierPurchaseKeys.all, 'receipt', supplierId, receiptNumber] as const,
};

export const useSupplierPurchases = (supplierId: string, page = 1, enabled = true) => useQuery({
  queryKey: supplierPurchaseKeys.list(supplierId, page),
  queryFn: () => supplierPurchasesApi.list(supplierId, page),
  enabled: enabled && Boolean(supplierId),
});

export const useSupplierPurchase = (id: string) => useQuery({
  queryKey: supplierPurchaseKeys.detail(id),
  queryFn: () => supplierPurchasesApi.get(id),
  enabled: Boolean(id),
});

/**
 * Advisory lookup while the user types a receipt number. A failure here is not
 * worth an error banner — the save path is unaffected by it.
 */
export const useReceiptCheck = (supplierId: string, receiptNumber: string) => {
  const debounced = useDebouncedValue(receiptNumber.trim());
  return useQuery({
    queryKey: supplierPurchaseKeys.receipt(supplierId, debounced),
    queryFn: () => supplierPurchasesApi.receiptCheck(supplierId, debounced),
    enabled: Boolean(supplierId && debounced),
    retry: false,
  });
};

/**
 * One purchase touches the supplier ledger, the receiving documents, the stock
 * ledger, and product quantities, so all four caches are refreshed together.
 */
export function useCreateSupplierPurchase() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ supplierId, input }: { supplierId: string; input: CreateSupplierPurchaseInput }) =>
      supplierPurchasesApi.create(supplierId, input),
    onSuccess: async () => {
      toast.success('Purchase saved / تم حفظ الفاتورة');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: supplierPurchaseKeys.all }),
        queryClient.invalidateQueries({ queryKey: supplierKeys.all }),
        queryClient.invalidateQueries({ queryKey: supplierLedgerKeyPrefix }),
        queryClient.invalidateQueries({ queryKey: supplierReceivingKeys.all }),
        queryClient.invalidateQueries({ queryKey: inventoryKeys.all }),
        queryClient.invalidateQueries({ queryKey: productKeys.all }),
      ]);
    },
  });
}
