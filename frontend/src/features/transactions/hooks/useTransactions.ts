import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { transactionsApi } from '../api/transactions.api';
import { CreateTransactionDto, TransactionQueryOptions } from '../types';

export const useTransactions = (options?: TransactionQueryOptions) => {
  return useQuery({
    queryKey: ['transactions', options],
    queryFn: () => transactionsApi.getTransactions(options),
  });
};

export const useCustomerTransactions = (customerId: string) => {
  return useQuery({
    queryKey: ['transactions', 'customer', customerId],
    queryFn: () => transactionsApi.getCustomerTransactions(customerId),
    enabled: !!customerId,
  });
};

export const useCustomerBalance = (customerId: string) => {
  return useQuery({
    queryKey: ['customers', customerId, 'balance'],
    queryFn: () => transactionsApi.getCustomerBalance(customerId),
    enabled: !!customerId,
  });
};

export const useCreateTransaction = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateTransactionDto) => transactionsApi.createTransaction(data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      if (variables.customerId) {
        queryClient.invalidateQueries({ queryKey: ['transactions', 'customer', variables.customerId] });
        queryClient.invalidateQueries({ queryKey: ['customers', variables.customerId, 'balance'] });
      }
      queryClient.invalidateQueries({ queryKey: ['customers'] });
    },
  });
};

export const useUpdateTransaction = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: import('../types').UpdateTransactionDto }) => 
      transactionsApi.updateTransaction(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
    },
  });
};

export const useDeleteTransaction = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => transactionsApi.deleteTransaction(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
    },
  });
};
