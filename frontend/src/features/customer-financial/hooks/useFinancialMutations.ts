import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { financialMutationsApi } from '../api/financial-mutations.api';
import {
  CancelFinancialRecordRequest,
  CreateDebtRequest,
  CreateInstallmentPlanRequest,
  CreatePrepaidPurchaseRequest,
  RecordDebtPaymentRequest,
  ReallocatePaymentRequest,
  RecordInstallmentPlanPaymentRequest,
  UpdateDebtRequest,
  UpdateInstallmentPlanRequest,
  VoidPaymentRequest,
} from '../types/customer-financial.types';
import { normalizeFinancialError } from '../utils/financial-form-errors';
import {
  debtDetailQueryKey,
  installmentPlanDetailQueryKey,
} from './useCustomerFinancialSummary';
import { prepaidQueryKeyPrefix } from '../../prepaid/hooks/usePrepaidPurchases';

export const customerFinancialSummaryMutationQueryKey = (customerId: string) =>
  ['customers', customerId, 'financial-summary'] as const;

export const salesOrdersMutationQueryKey = ['sales-orders'] as const;

// Prepaid purchases are debts, so a debt-side write (a new prepaid purchase, an
// extra bill, a void) leaves the prepaid section showing stale totals.
const invalidateCustomerSurfaces = (queryClient: ReturnType<typeof useQueryClient>, customerId: string) =>
  Promise.all([
    queryClient.invalidateQueries({ queryKey: ['customer', customerId] }),
    queryClient.invalidateQueries({ queryKey: customerFinancialSummaryMutationQueryKey(customerId) }),
    queryClient.invalidateQueries({ queryKey: ['customers'] }),
    queryClient.invalidateQueries({ queryKey: ['receivables'] }),
    queryClient.invalidateQueries({ queryKey: ['customer-activity', customerId] }),
    queryClient.invalidateQueries({ queryKey: prepaidQueryKeyPrefix }),
  ]);

export const useCreateDebt = (customerId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateDebtRequest) => financialMutationsApi.createDebt(customerId, data),
    onSuccess: async () => {
      await invalidateCustomerSurfaces(queryClient, customerId);
      toast.success('Debt created successfully');
    },
    onError: (error) => {
      toast.error(normalizeFinancialError(error).message);
    },
  });
};

export const useCreatePrepaidPurchase = (customerId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreatePrepaidPurchaseRequest) =>
      financialMutationsApi.createPrepaidPurchase(customerId, data),
    onSuccess: async () => {
      await invalidateCustomerSurfaces(queryClient, customerId);
      toast.success('Prepaid purchase created successfully');
    },
    onError: (error) => {
      toast.error(normalizeFinancialError(error).message);
    },
  });
};

export const useRecordDebtPayment = (customerId: string, debtId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: RecordDebtPaymentRequest) =>
      financialMutationsApi.recordDebtPayment(debtId, data),
    onSuccess: async () => {
      await Promise.all([
        invalidateCustomerSurfaces(queryClient, customerId),
        queryClient.invalidateQueries({ queryKey: debtDetailQueryKey(debtId) }),
        queryClient.invalidateQueries({ queryKey: salesOrdersMutationQueryKey }),
      ]);
      toast.success('Debt payment recorded');
    },
    onError: (error) => {
      toast.error(normalizeFinancialError(error).message);
    },
  });
};

export const useUpdateDebt = (customerId: string, debtId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdateDebtRequest) =>
      financialMutationsApi.updateDebt(debtId, data),
    onSuccess: async () => {
      await Promise.all([
        invalidateCustomerSurfaces(queryClient, customerId),
        queryClient.invalidateQueries({ queryKey: debtDetailQueryKey(debtId) }),
      ]);
      toast.success('Debt updated');
    },
    onError: (error) => {
      toast.error(normalizeFinancialError(error).message);
    },
  });
};

export const useCancelDebt = (customerId: string, debtId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CancelFinancialRecordRequest) =>
      financialMutationsApi.cancelDebt(debtId, data),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: customerFinancialSummaryMutationQueryKey(customerId),
        }),
        queryClient.invalidateQueries({ queryKey: debtDetailQueryKey(debtId) }),
        queryClient.invalidateQueries({ queryKey: prepaidQueryKeyPrefix }),
      ]);
      toast.success('Debt cancelled');
    },
    onError: (error) => {
      toast.error(normalizeFinancialError(error).message);
    },
  });
};

export const useVoidPayment = (customerId: string, paymentId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: VoidPaymentRequest) => financialMutationsApi.voidPayment(paymentId, data),
    onSuccess: async () => {
      await invalidateCustomerSurfaces(queryClient, customerId);
      toast.success('Payment voided');
    },
    onError: (error) => {
      toast.error(normalizeFinancialError(error).message);
    },
  });
};

export const useReallocatePayment = (customerId: string, paymentId: string, planId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: ReallocatePaymentRequest) =>
      financialMutationsApi.reallocatePayment(paymentId, data),
    onSuccess: async () => {
      await Promise.all([
        invalidateCustomerSurfaces(queryClient, customerId),
        queryClient.invalidateQueries({ queryKey: installmentPlanDetailQueryKey(planId) }),
      ]);
      toast.success('Payment allocation updated');
    },
    onError: (error) => {
      toast.error(normalizeFinancialError(error).message);
    },
  });
};

export const useCreateInstallmentPlan = (customerId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateInstallmentPlanRequest) =>
      financialMutationsApi.createInstallmentPlan(customerId, data),
    onSuccess: async () => {
      await invalidateCustomerSurfaces(queryClient, customerId);
      toast.success('Installment plan created');
    },
    onError: (error) => {
      toast.error(normalizeFinancialError(error).message);
    },
  });
};

export const useUpdateInstallmentPlan = (customerId: string, planId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdateInstallmentPlanRequest) =>
      financialMutationsApi.updateInstallmentPlan(planId, data),
    onSuccess: async () => {
      await Promise.all([
        invalidateCustomerSurfaces(queryClient, customerId),
        queryClient.invalidateQueries({ queryKey: installmentPlanDetailQueryKey(planId) }),
      ]);
      toast.success('Installment plan updated');
    },
    onError: (error) => {
      toast.error(normalizeFinancialError(error).message);
    },
  });
};

export const useRecordInstallmentPlanPayment = (customerId: string, planId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: RecordInstallmentPlanPaymentRequest) =>
      financialMutationsApi.recordInstallmentPlanPayment(planId, data),
    onSuccess: async () => {
      await Promise.all([
        invalidateCustomerSurfaces(queryClient, customerId),
        queryClient.invalidateQueries({ queryKey: installmentPlanDetailQueryKey(planId) }),
      ]);
      toast.success('Installment payment recorded');
    },
    onError: (error) => {
      toast.error(normalizeFinancialError(error).message);
    },
  });
};

export const useCancelInstallmentPlan = (customerId: string, planId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CancelFinancialRecordRequest) =>
      financialMutationsApi.cancelInstallmentPlan(planId, data),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: customerFinancialSummaryMutationQueryKey(customerId),
        }),
        queryClient.invalidateQueries({ queryKey: installmentPlanDetailQueryKey(planId) }),
      ]);
      toast.success('Installment plan cancelled');
    },
    onError: (error) => {
      toast.error(normalizeFinancialError(error).message);
    },
  });
};
