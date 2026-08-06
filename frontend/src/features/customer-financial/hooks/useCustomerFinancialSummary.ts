import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { customerFinancialApi } from '../api/customer-financial.api';
import { CustomerFinancialSummaryOptions } from '../types/customer-financial.types';

export const customerFinancialSummaryQueryKey = (
  customerId: string,
  options?: CustomerFinancialSummaryOptions
) => [
  'customers',
  customerId,
  'financial-summary',
  {
    includeCancelled: options?.includeCancelled ?? false,
    includePayments: options?.includePayments ?? true,
    paymentLimit: options?.paymentLimit ?? 20,
    debtLimit: options?.debtLimit ?? 50,
    planLimit: options?.planLimit ?? 50,
    month: options?.month,
  },
] as const;

export const debtDetailQueryKey = (debtId: string) => ['debts', debtId] as const;

export const installmentPlanDetailQueryKey = (planId: string) =>
  ['installment-plans', planId] as const;

export const isCustomerFinancialSummaryQueryEnabled = (customerId: string | undefined) =>
  Boolean(customerId);

export const useCustomerFinancialSummary = (
  customerId: string | undefined,
  options?: CustomerFinancialSummaryOptions
) => {
  const stableOptions = useMemo(
    () => ({
      includeCancelled: options?.includeCancelled ?? false,
      includePayments: options?.includePayments ?? true,
      paymentLimit: options?.paymentLimit ?? 20,
      debtLimit: options?.debtLimit ?? 50,
      planLimit: options?.planLimit ?? 50,
      month: options?.month,
    }),
    [
      options?.includeCancelled,
      options?.includePayments,
      options?.paymentLimit,
      options?.debtLimit,
      options?.planLimit,
      options?.month,
    ]
  );

  return useQuery({
    queryKey: customerFinancialSummaryQueryKey(customerId ?? '', stableOptions),
    queryFn: () => customerFinancialApi.getCustomerFinancialSummary(customerId ?? '', stableOptions),
    enabled: isCustomerFinancialSummaryQueryEnabled(customerId),
  });
};

export const useDebtDetail = (debtId: string | null) =>
  useQuery({
    queryKey: debtDetailQueryKey(debtId ?? ''),
    queryFn: () => customerFinancialApi.getDebtDetail(debtId ?? ''),
    enabled: Boolean(debtId),
  });

export const useInstallmentPlanDetail = (planId: string | null) =>
  useQuery({
    queryKey: installmentPlanDetailQueryKey(planId ?? ''),
    queryFn: () => customerFinancialApi.getInstallmentPlanDetail(planId ?? ''),
    enabled: Boolean(planId),
  });
