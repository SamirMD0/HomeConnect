import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { prepaidApi } from '../api/prepaid.api';
import { DeliverPrepaidPayload, RevertPrepaidDeliveryPayload } from '../types/prepaid.types';
import { prepaidQueryKeyPrefix } from './usePrepaidPurchases';
import { financialLedgerQueryKeyPrefix } from '../../financial-ledger/hooks/useFinancialLedger';
import { receivablesQueryKeyPrefix } from '../../receivables/hooks/useReceivables';
import { normalizeFinancialError } from '../../customer-financial/utils/financial-form-errors';

/**
 * Delivering converts the unpaid remainder into a real receivable, so the
 * receivables cache is stale too, not just the prepaid list. The customer
 * profile carries the same prepaid balance, so it is refreshed as well.
 */
const useInvalidatePrepaidCaches = () => {
  const queryClient = useQueryClient();
  return async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: prepaidQueryKeyPrefix }),
      queryClient.invalidateQueries({ queryKey: financialLedgerQueryKeyPrefix }),
      queryClient.invalidateQueries({ queryKey: receivablesQueryKeyPrefix }),
      // Covers ['customers', customerId, 'financial-summary'] by prefix.
      queryClient.invalidateQueries({ queryKey: ['customers'] }),
    ]);
  };
};

export const useDeliverPrepaidPurchase = (id: string) => {
  const invalidate = useInvalidatePrepaidCaches();

  return useMutation({
    mutationFn: (payload: DeliverPrepaidPayload) => prepaidApi.deliver(id, payload),
    onSuccess: async () => {
      await invalidate();
      toast.success('Marked as delivered');
    },
    onError: (error) => toast.error(normalizeFinancialError(error).message),
  });
};

export const useRevertPrepaidDelivery = (id: string) => {
  const invalidate = useInvalidatePrepaidCaches();

  return useMutation({
    mutationFn: (payload: RevertPrepaidDeliveryPayload) => prepaidApi.revertDelivery(id, payload),
    onSuccess: async () => {
      await invalidate();
      toast.success('Delivery reverted');
    },
    onError: (error) => toast.error(normalizeFinancialError(error).message),
  });
};
