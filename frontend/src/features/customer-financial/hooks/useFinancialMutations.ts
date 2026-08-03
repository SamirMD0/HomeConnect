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

export const customerFinancialSummaryMutationQueryKey = (customerId: string) =>
  ['customers', customerId, 'financial-summary'] as const;

export const salesOrdersMutationQueryKey = ['sales-orders'] as const;

export const useCreateDebt = (customerId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateDebtRequest) => financialMutationsApi.createDebt(customerId, data),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: customerFinancialSummaryMutationQueryKey(customerId),
      });
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
      await queryClient.invalidateQueries({
        queryKey: customerFinancialSummaryMutationQueryKey(customerId),
      });
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
        queryClient.invalidateQueries({
          queryKey: customerFinancialSummaryMutationQueryKey(customerId),
        }),
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
        queryClient.invalidateQueries({
          queryKey: customerFinancialSummaryMutationQueryKey(customerId),
        }),
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
      await queryClient.invalidateQueries({
        queryKey: customerFinancialSummaryMutationQueryKey(customerId),
      });
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
        queryClient.invalidateQueries({
          queryKey: customerFinancialSummaryMutationQueryKey(customerId),
        }),
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
      await queryClient.invalidateQueries({
        queryKey: customerFinancialSummaryMutationQueryKey(customerId),
      });
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
        queryClient.invalidateQueries({
          queryKey: customerFinancialSummaryMutationQueryKey(customerId),
        }),
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
        queryClient.invalidateQueries({
          queryKey: customerFinancialSummaryMutationQueryKey(customerId),
        }),
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
