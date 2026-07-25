import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { financialMutationsApi } from '../api/financial-mutations.api';
import {
  CancelFinancialRecordRequest,
  CreateDebtRequest,
  CreateInstallmentPlanRequest,
  RecordDebtPaymentRequest,
  RecordInstallmentPlanPaymentRequest,
} from '../types/customer-financial.types';
import { normalizeFinancialError } from '../utils/financial-form-errors';
import {
  debtDetailQueryKey,
  installmentPlanDetailQueryKey,
} from './useCustomerFinancialSummary';

export const customerFinancialSummaryMutationQueryKey = (customerId: string) =>
  ['customers', customerId, 'financial-summary'] as const;

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
      ]);
      toast.success('Debt payment recorded');
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
