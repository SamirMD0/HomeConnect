import { api } from '../../../services/api';
import {
  CreateTransactionDto,
  UpdateTransactionDto,
  TransactionListResponse,
  TransactionQueryOptions,
  TransactionResponse,
  Transaction
} from '../types';

export const transactionsApi = {
  getTransactions: async (params?: TransactionQueryOptions) => {
    const response = await api.get<TransactionListResponse>('/transactions', { params });
    return response.data;
  },

  getTransaction: async (id: string) => {
    const response = await api.get<TransactionResponse>(`/transactions/${id}`);
    return response.data;
  },

  createTransaction: async (data: CreateTransactionDto) => {
    const response = await api.post<TransactionResponse>('/transactions', data);
    return response.data;
  },

  updateTransaction: async (id: string, data: UpdateTransactionDto) => {
    const response = await api.put<TransactionResponse>(`/transactions/${id}`, data);
    return response.data;
  },

  deleteTransaction: async (id: string) => {
    const response = await api.delete<{ success: boolean; message: string }>(`/transactions/${id}`);
    return response.data;
  },

  getCustomerTransactions: async (customerId: string) => {
    const response = await api.get<{ success: boolean; data: Transaction[] }>(
      `/customers/${customerId}/transactions`
    );
    return response.data;
  },

  getCustomerBalance: async (customerId: string) => {
    const response = await api.get<{ success: boolean; data: { balance: number } }>(
      `/customers/${customerId}/balance`
    );
    return response.data;
  },
};
